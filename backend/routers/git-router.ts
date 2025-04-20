import express from "express";
import { R } from "redbean-node";
import { GitRepository } from "../models/git-repository";
import { GitCredential } from "../models/git-credential";
import { GitDeployment } from "../models/git-deployment";
import { GitManager } from "../git-manager";
import { GitOpsService } from "../services/gitops-service";
import { log } from "../log";
import { authMiddleware } from "../middlewares";

const router = express.Router();

// Initialize services
const gitManager = new GitManager();
const gitOpsService = new GitOpsService();

// Initialize services on startup
(async () => {
    try {
        await gitManager.initialize();
        await gitOpsService.initialize();
    } catch (error) {
        log.error("git-router", `Failed to initialize Git services: ${error}`);
    }
})();

/**
 * Get all repositories
 */
router.get("/repositories", async (req, res) => {
    try {
        const repositories = await GitRepository.getRepositoryList();
        res.json({
            repositories: repositories.map(repo => repo.toJSON()),
        });
    } catch (error) {
        log.error("git-router", `Error getting repositories: ${error}`);
        res.status(500).json({ error: "Failed to get repositories" });
    }
});

/**
 * Get repositories by agent
 */
router.get("/repositories/agent/:agentId", async (req, res) => {
    try {
        const agentId = req.params.agentId === "local" ? null : parseInt(req.params.agentId);
        const repositories = await GitRepository.getRepositoriesByAgent(agentId);
        res.json({
            repositories: repositories.map(repo => repo.toJSON()),
        });
    } catch (error) {
        log.error("git-router", `Error getting repositories for agent: ${error}`);
        res.status(500).json({ error: "Failed to get repositories" });
    }
});

/**
 * Get specific repository
 */
router.get("/repositories/:id", async (req, res) => {
    try {
        const repository = await GitRepository.findById(parseInt(req.params.id));
        
        if (!repository) {
            return res.status(404).json({ error: "Repository not found" });
        }
        
        res.json({
            repository: repository.toJSON(),
        });
    } catch (error) {
        log.error("git-router", `Error getting repository: ${error}`);
        res.status(500).json({ error: "Failed to get repository" });
    }
});

/**
 * Create repository
 */
router.post("/repositories", async (req, res) => {
    try {
        const {
            name,
            url,
            branch = "main",
            agentId,
            authType = "none",
            authCredentialId,
            path = "",
            syncInterval = 0,
        } = req.body;
        
        // Validate required fields
        if (!name || !url) {
            return res.status(400).json({ error: "Name and URL are required" });
        }
        
        // Create repository
        const repository = R.dispense("git_repository") as GitRepository;
        repository.name = name;
        repository.url = url;
        repository.branch = branch;
        repository.agent_id = agentId || null;
        repository.auth_type = authType;
        repository.auth_credential_id = authCredentialId || null;
        repository.path = path;
        repository.sync_interval = syncInterval;
        repository.created_at = new Date();
        repository.updated_at = new Date();
        
        const id = await R.store(repository);
        
        // Clone repository
        if (authType !== "none" && authCredentialId) {
            const credential = await GitCredential.findById(authCredentialId);
            if (credential) {
                gitManager.cloneRepository(repository, credential)
                    .then(result => {
                        if (!result.success) {
                            log.error("git-router", `Failed to clone repository: ${result.message}`);
                        }
                    });
            }
        } else {
            gitManager.cloneRepository(repository)
                .then(result => {
                    if (!result.success) {
                        log.error("git-router", `Failed to clone repository: ${result.message}`);
                    }
                });
        }
        
        res.json({
            id,
            message: "Repository created successfully",
        });
    } catch (error) {
        log.error("git-router", `Error creating repository: ${error}`);
        res.status(500).json({ error: "Failed to create repository" });
    }
});

/**
 * Update repository
 */
router.put("/repositories/:id", async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const repository = await GitRepository.findById(id);
        
        if (!repository) {
            return res.status(404).json({ error: "Repository not found" });
        }
        
        const {
            name,
            url,
            branch,
            agentId,
            authType,
            authCredentialId,
            path,
            syncInterval,
        } = req.body;
        
        // Update fields
        if (name !== undefined) repository.name = name;
        if (url !== undefined) repository.url = url;
        if (branch !== undefined) repository.branch = branch;
        if (agentId !== undefined) repository.agent_id = agentId || null;
        if (authType !== undefined) repository.auth_type = authType;
        if (authCredentialId !== undefined) repository.auth_credential_id = authCredentialId || null;
        if (path !== undefined) repository.path = path;
        if (syncInterval !== undefined) repository.sync_interval = syncInterval;
        
        repository.updated_at = new Date();
        
        await R.store(repository);
        
        res.json({
            message: "Repository updated successfully",
        });
    } catch (error) {
        log.error("git-router", `Error updating repository: ${error}`);
        res.status(500).json({ error: "Failed to update repository" });
    }
});

/**
 * Delete repository
 */
router.delete("/repositories/:id", async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const repository = await GitRepository.findById(id);
        
        if (!repository) {
            return res.status(404).json({ error: "Repository not found" });
        }
        
        // Delete related deployments
        await R.exec("DELETE FROM git_deployment WHERE repository_id = ?", [id]);
        
        // Delete repository
        await R.trash(repository);
        
        // TODO: Delete local files
        
        res.json({
            message: "Repository deleted successfully",
        });
    } catch (error) {
        log.error("git-router", `Error deleting repository: ${error}`);
        res.status(500).json({ error: "Failed to delete repository" });
    }
});

/**
 * Scan repository for compose files
 */
router.get("/repositories/:id/scan", async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const repository = await GitRepository.findById(id);
        
        if (!repository) {
            return res.status(404).json({ error: "Repository not found" });
        }
        
        const result = await gitManager.scanForComposeFiles(repository);
        
        if (result.success) {
            res.json({
                files: result.data,
            });
        } else {
            res.status(500).json({ error: result.message });
        }
    } catch (error) {
        log.error("git-router", `Error scanning repository: ${error}`);
        res.status(500).json({ error: "Failed to scan repository" });
    }
});

/**
 * Sync repository
 */
router.post("/repositories/:id/sync", async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const repository = await GitRepository.findById(id);
        
        if (!repository) {
            return res.status(404).json({ error: "Repository not found" });
        }
        
        const result = await gitOpsService.syncRepository(id);
        
        if (result.success) {
            res.json({
                message: result.message,
                changedFiles: result.changedFiles || [],
            });
        } else {
            res.status(500).json({ error: result.message });
        }
    } catch (error) {
        log.error("git-router", `Error syncing repository: ${error}`);
        res.status(500).json({ error: "Failed to sync repository" });
    }
});

/**
 * Deploy from repository
 */
router.post("/repositories/:id/deploy", async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { filePath, stackName, variables, force } = req.body;
        
        if (!filePath) {
            return res.status(400).json({ error: "File path is required" });
        }
        
        const result = await gitOpsService.deployFromRepository({
            repositoryId: id,
            filePath,
            stackName,
            variables,
            force,
        });
        
        if (result.success) {
            res.json({
                message: result.message,
                stackName: result.stackName,
            });
        } else {
            res.status(500).json({ error: result.message });
        }
    } catch (error) {
        log.error("git-router", `Error deploying from repository: ${error}`);
        res.status(500).json({ error: "Failed to deploy from repository" });
    }
});

/**
 * Get deployments for repository
 */
router.get("/repositories/:id/deployments", async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const repository = await GitRepository.findById(id);
        
        if (!repository) {
            return res.status(404).json({ error: "Repository not found" });
        }
        
        const deployments = await GitDeployment.getDeploymentsForRepository(id);
        
        res.json({
            deployments: deployments.map(deployment => deployment.toJSON()),
        });
    } catch (error) {
        log.error("git-router", `Error getting deployments: ${error}`);
        res.status(500).json({ error: "Failed to get deployments" });
    }
});

/**
 * Rollback to deployment
 */
router.post("/deployments/:id/rollback", async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        
        const result = await gitOpsService.rollbackToDeployment(id);
        
        if (result.success) {
            res.json({
                message: result.message,
                stackName: result.stackName,
            });
        } else {
            res.status(500).json({ error: result.message });
        }
    } catch (error) {
        log.error("git-router", `Error rolling back deployment: ${error}`);
        res.status(500).json({ error: "Failed to rollback deployment" });
    }
});

/**
 * Get all credentials
 */
router.get("/credentials", async (req, res) => {
    try {
        const credentials = await GitCredential.getCredentialList();
        res.json({
            credentials: credentials.map(cred => cred.toJSON()),
        });
    } catch (error) {
        log.error("git-router", `Error getting credentials: ${error}`);
        res.status(500).json({ error: "Failed to get credentials" });
    }
});

/**
 * Create credential
 */
router.post("/credentials", async (req, res) => {
    try {
        const { name, type, data } = req.body;
        
        // Validate required fields
        if (!name || !type || !data) {
            return res.status(400).json({ error: "Name, type, and data are required" });
        }
        
        // Create credential
        const credential = R.dispense("git_credential") as GitCredential;
        credential.name = name;
        credential.type = type;
        credential.setEncryptedData(data);
        credential.created_at = new Date();
        credential.updated_at = new Date();
        
        const id = await R.store(credential);
        
        res.json({
            id,
            message: "Credential created successfully",
        });
    } catch (error) {
        log.error("git-router", `Error creating credential: ${error}`);
        res.status(500).json({ error: "Failed to create credential" });
    }
});

/**
 * Update credential
 */
router.put("/credentials/:id", async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const credential = await GitCredential.findById(id);
        
        if (!credential) {
            return res.status(404).json({ error: "Credential not found" });
        }
        
        const { name, type, data } = req.body;
        
        // Update fields
        if (name !== undefined) credential.name = name;
        if (type !== undefined) credential.type = type;
        if (data !== undefined) credential.setEncryptedData(data);
        
        credential.updated_at = new Date();
        
        await R.store(credential);
        
        res.json({
            message: "Credential updated successfully",
        });
    } catch (error) {
        log.error("git-router", `Error updating credential: ${error}`);
        res.status(500).json({ error: "Failed to update credential" });
    }
});

/**
 * Delete credential
 */
router.delete("/credentials/:id", async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const credential = await GitCredential.findById(id);
        
        if (!credential) {
            return res.status(404).json({ error: "Credential not found" });
        }
        
        // Check if credential is in use by any repository
        const repositories = await R.find("git_repository", " auth_credential_id = ? ", [id]);
        
        if (repositories.length > 0) {
            return res.status(400).json({ error: "Credential is in use by repositories" });
        }
        
        // Delete credential
        await R.trash(credential);
        
        res.json({
            message: "Credential deleted successfully",
        });
    } catch (error) {
        log.error("git-router", `Error deleting credential: ${error}`);
        res.status(500).json({ error: "Failed to delete credential" });
    }
});

export default router;