import { Server, Socket } from "socket.io";
import { GitManager } from "../git-manager";
import { GitOpsService } from "../services/gitops-service";
import { GitRepository } from "../models/git-repository";
import { GitCredential } from "../models/git-credential";
import { GitDeployment } from "../models/git-deployment";
import { R } from "redbean-node";
import { log } from "../log";

interface GitOperationProgress {
    stage: string;
    message: string;
    percentage: number; // 0-100
}

/**
 * Handles Git-related socket events
 */
export class GitSocketHandler {
    server: Server;
    socket: Socket;
    userID: number;
    gitManager: GitManager;
    gitOpsService: GitOpsService;

    /**
     * Create a new GitSocketHandler
     * @param server - Socket.IO server
     * @param socket - Socket.IO socket
     * @param userID - User ID
     */
    constructor(server: Server, socket: Socket, userID: number) {
        this.server = server;
        this.socket = socket;
        this.userID = userID;
        this.gitManager = new GitManager();
        this.gitOpsService = new GitOpsService();

        this.registerHandlers();
    }

    /**
     * Register socket event handlers
     */
    private registerHandlers(): void {
        this.socket.on("getRepositoryList", this.getRepositoryList.bind(this));
        this.socket.on("getRepositoriesByAgent", this.getRepositoriesByAgent.bind(this));
        this.socket.on("getRepository", this.getRepository.bind(this));
        this.socket.on("addRepository", this.addRepository.bind(this));
        this.socket.on("updateRepository", this.updateRepository.bind(this));
        this.socket.on("deleteRepository", this.deleteRepository.bind(this));
        this.socket.on("scanRepository", this.scanRepository.bind(this));
        this.socket.on("syncRepository", this.syncRepository.bind(this));
        this.socket.on("deployFromRepository", this.deployFromRepository.bind(this));
        this.socket.on("getDeployments", this.getDeployments.bind(this));
        this.socket.on("rollbackDeployment", this.rollbackDeployment.bind(this));
        this.socket.on("getCredentialList", this.getCredentialList.bind(this));
        this.socket.on("addCredential", this.addCredential.bind(this));
        this.socket.on("updateCredential", this.updateCredential.bind(this));
        this.socket.on("deleteCredential", this.deleteCredential.bind(this));
    }

    /**
     * Get list of all repositories
     * @param callback - Socket.IO callback
     */
    async getRepositoryList(callback: (data: any) => void): Promise<void> {
        try {
            const repositories = await GitRepository.getRepositoryList();
            callback({
                ok: true,
                repositories: repositories.map(repo => repo.toJSON()),
            });
        } catch (error) {
            log.error("git-socket", `Error getting repository list: ${error}`);
            callback({
                ok: false,
                error: "Failed to get repository list",
            });
        }
    }

    /**
     * Get repositories by agent
     * @param agentId - Agent ID or "local"
     * @param callback - Socket.IO callback
     */
    async getRepositoriesByAgent(agentId: string | number | null, callback: (data: any) => void): Promise<void> {
        try {
            const agentIdValue = agentId === "local" ? null : typeof agentId === "string" ? parseInt(agentId) : agentId;
            const repositories = await GitRepository.getRepositoriesByAgent(agentIdValue);
            callback({
                ok: true,
                repositories: repositories.map(repo => repo.toJSON()),
            });
        } catch (error) {
            log.error("git-socket", `Error getting repositories by agent: ${error}`);
            callback({
                ok: false,
                error: "Failed to get repositories by agent",
            });
        }
    }

    /**
     * Get a specific repository
     * @param id - Repository ID
     * @param callback - Socket.IO callback
     */
    async getRepository(id: number, callback: (data: any) => void): Promise<void> {
        try {
            const repository = await GitRepository.findById(id);
            
            if (!repository) {
                return callback({
                    ok: false,
                    error: "Repository not found",
                });
            }
            
            callback({
                ok: true,
                repository: repository.toJSON(),
            });
        } catch (error) {
            log.error("git-socket", `Error getting repository: ${error}`);
            callback({
                ok: false,
                error: "Failed to get repository",
            });
        }
    }

    /**
     * Add a new repository
     * @param data - Repository data
     * @param callback - Socket.IO callback
     */
    async addRepository(data: any, callback: (data: any) => void): Promise<void> {
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
            } = data;
            
            // Validate required fields
            if (!name || !url) {
                return callback({
                    ok: false,
                    error: "Name and URL are required",
                });
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
            
            // Start progress tracking
            this.emitProgress("add-repository", {
                stage: "preparing",
                message: "Repository created, preparing to clone...",
                percentage: 10,
            });
            
            // Clone repository
            if (authType !== "none" && authCredentialId) {
                const credential = await GitCredential.findById(authCredentialId);
                
                this.emitProgress("add-repository", {
                    stage: "cloning",
                    message: "Cloning repository...",
                    percentage: 25,
                });
                
                if (credential) {
                    const result = await this.gitManager.cloneRepository(repository, credential);
                    
                    if (result.success) {
                        this.emitProgress("add-repository", {
                            stage: "complete",
                            message: "Repository cloned successfully",
                            percentage: 100,
                        });
                    } else {
                        this.emitProgress("add-repository", {
                            stage: "error",
                            message: `Failed to clone repository: ${result.message}`,
                            percentage: 100,
                        });
                        
                        log.error("git-socket", `Failed to clone repository: ${result.message}`);
                    }
                }
            } else {
                this.emitProgress("add-repository", {
                    stage: "cloning",
                    message: "Cloning repository...",
                    percentage: 25,
                });
                
                const result = await this.gitManager.cloneRepository(repository);
                
                if (result.success) {
                    this.emitProgress("add-repository", {
                        stage: "complete",
                        message: "Repository cloned successfully",
                        percentage: 100,
                    });
                } else {
                    this.emitProgress("add-repository", {
                        stage: "error",
                        message: `Failed to clone repository: ${result.message}`,
                        percentage: 100,
                    });
                    
                    log.error("git-socket", `Failed to clone repository: ${result.message}`);
                }
            }
            
            callback({
                ok: true,
                id,
                message: "Repository created successfully",
            });
        } catch (error) {
            log.error("git-socket", `Error adding repository: ${error}`);
            callback({
                ok: false,
                error: "Failed to add repository",
            });
        }
    }

    /**
     * Update a repository
     * @param data - Repository data with ID
     * @param callback - Socket.IO callback
     */
    async updateRepository(data: any, callback: (data: any) => void): Promise<void> {
        try {
            const { id } = data;
            if (!id) {
                return callback({
                    ok: false,
                    error: "Repository ID is required",
                });
            }
            
            const repository = await GitRepository.findById(id);
            
            if (!repository) {
                return callback({
                    ok: false,
                    error: "Repository not found",
                });
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
            } = data;
            
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
            
            callback({
                ok: true,
                message: "Repository updated successfully",
            });
        } catch (error) {
            log.error("git-socket", `Error updating repository: ${error}`);
            callback({
                ok: false,
                error: "Failed to update repository",
            });
        }
    }

    /**
     * Delete a repository
     * @param id - Repository ID
     * @param callback - Socket.IO callback
     */
    async deleteRepository(id: number, callback: (data: any) => void): Promise<void> {
        try {
            const repository = await GitRepository.findById(id);
            
            if (!repository) {
                return callback({
                    ok: false,
                    error: "Repository not found",
                });
            }
            
            // Delete related deployments
            await R.exec("DELETE FROM git_deployment WHERE repository_id = ?", [id]);
            
            // Delete repository
            await R.trash(repository);
            
            // TODO: Delete local files
            
            callback({
                ok: true,
                message: "Repository deleted successfully",
            });
        } catch (error) {
            log.error("git-socket", `Error deleting repository: ${error}`);
            callback({
                ok: false,
                error: "Failed to delete repository",
            });
        }
    }

    /**
     * Scan a repository for Docker Compose files
     * @param id - Repository ID
     * @param callback - Socket.IO callback
     */
    async scanRepository(id: number, callback: (data: any) => void): Promise<void> {
        try {
            const repository = await GitRepository.findById(id);
            
            if (!repository) {
                return callback({
                    ok: false,
                    error: "Repository not found",
                });
            }
            
            this.emitProgress("scan-repository", {
                stage: "scanning",
                message: "Scanning repository for compose files...",
                percentage: 30,
            });
            
            const result = await this.gitManager.scanForComposeFiles(repository);
            
            if (result.success) {
                this.emitProgress("scan-repository", {
                    stage: "complete",
                    message: `Found ${result.data.length} compose files`,
                    percentage: 100,
                });
                
                callback({
                    ok: true,
                    files: result.data,
                });
            } else {
                this.emitProgress("scan-repository", {
                    stage: "error",
                    message: result.message,
                    percentage: 100,
                });
                
                callback({
                    ok: false,
                    error: result.message,
                });
            }
        } catch (error) {
            log.error("git-socket", `Error scanning repository: ${error}`);
            callback({
                ok: false,
                error: "Failed to scan repository",
            });
        }
    }

    /**
     * Synchronize a repository
     * @param id - Repository ID
     * @param callback - Socket.IO callback
     */
    async syncRepository(id: number, callback: (data: any) => void): Promise<void> {
        try {
            const repository = await GitRepository.findById(id);
            
            if (!repository) {
                return callback({
                    ok: false,
                    error: "Repository not found",
                });
            }
            
            this.emitProgress("sync-repository", {
                stage: "syncing",
                message: "Syncing repository...",
                percentage: 30,
            });
            
            const result = await this.gitOpsService.syncRepository(id);
            
            if (result.success) {
                this.emitProgress("sync-repository", {
                    stage: "complete",
                    message: result.message,
                    percentage: 100,
                });
                
                callback({
                    ok: true,
                    message: result.message,
                    changedFiles: result.changedFiles || [],
                });
            } else {
                this.emitProgress("sync-repository", {
                    stage: "error",
                    message: result.message,
                    percentage: 100,
                });
                
                callback({
                    ok: false,
                    error: result.message,
                });
            }
        } catch (error) {
            log.error("git-socket", `Error syncing repository: ${error}`);
            callback({
                ok: false,
                error: "Failed to sync repository",
            });
        }
    }

    /**
     * Deploy a stack from a repository
     * @param data - Deployment data
     * @param callback - Socket.IO callback
     */
    async deployFromRepository(data: any, callback: (data: any) => void): Promise<void> {
        try {
            const { repositoryId, filePath, stackName, variables, force } = data;
            
            if (!repositoryId || !filePath) {
                return callback({
                    ok: false,
                    error: "Repository ID and file path are required",
                });
            }
            
            this.emitProgress("deploy-repository", {
                stage: "preparing",
                message: "Preparing deployment...",
                percentage: 10,
            });
            
            this.emitProgress("deploy-repository", {
                stage: "deploying",
                message: "Deploying stack from repository...",
                percentage: 40,
            });
            
            const result = await this.gitOpsService.deployFromRepository({
                repositoryId,
                filePath,
                stackName,
                variables,
                force,
            });
            
            if (result.success) {
                this.emitProgress("deploy-repository", {
                    stage: "complete",
                    message: result.message,
                    percentage: 100,
                });
                
                callback({
                    ok: true,
                    message: result.message,
                    stackName: result.stackName,
                });
            } else {
                this.emitProgress("deploy-repository", {
                    stage: "error",
                    message: result.message,
                    percentage: 100,
                });
                
                callback({
                    ok: false,
                    error: result.message,
                });
            }
        } catch (error) {
            log.error("git-socket", `Error deploying from repository: ${error}`);
            callback({
                ok: false,
                error: "Failed to deploy from repository",
            });
        }
    }

    /**
     * Get deployments for a repository
     * @param repositoryId - Repository ID
     * @param callback - Socket.IO callback
     */
    async getDeployments(repositoryId: number, callback: (data: any) => void): Promise<void> {
        try {
            const repository = await GitRepository.findById(repositoryId);
            
            if (!repository) {
                return callback({
                    ok: false,
                    error: "Repository not found",
                });
            }
            
            const deployments = await GitDeployment.getDeploymentsForRepository(repositoryId);
            
            callback({
                ok: true,
                deployments: deployments.map(deployment => deployment.toJSON()),
            });
        } catch (error) {
            log.error("git-socket", `Error getting deployments: ${error}`);
            callback({
                ok: false,
                error: "Failed to get deployments",
            });
        }
    }

    /**
     * Rollback to a previous deployment
     * @param deploymentId - Deployment ID
     * @param callback - Socket.IO callback
     */
    async rollbackDeployment(deploymentId: number, callback: (data: any) => void): Promise<void> {
        try {
            const deployment = await GitDeployment.findById(deploymentId);
            
            if (!deployment) {
                return callback({
                    ok: false,
                    error: "Deployment not found",
                });
            }
            
            this.emitProgress("rollback-deployment", {
                stage: "preparing",
                message: "Preparing rollback...",
                percentage: 10,
            });
            
            this.emitProgress("rollback-deployment", {
                stage: "rolling-back",
                message: "Rolling back to previous deployment...",
                percentage: 40,
            });
            
            const result = await this.gitOpsService.rollbackToDeployment(deploymentId);
            
            if (result.success) {
                this.emitProgress("rollback-deployment", {
                    stage: "complete",
                    message: result.message,
                    percentage: 100,
                });
                
                callback({
                    ok: true,
                    message: result.message,
                    stackName: result.stackName,
                });
            } else {
                this.emitProgress("rollback-deployment", {
                    stage: "error",
                    message: result.message,
                    percentage: 100,
                });
                
                callback({
                    ok: false,
                    error: result.message,
                });
            }
        } catch (error) {
            log.error("git-socket", `Error rolling back deployment: ${error}`);
            callback({
                ok: false,
                error: "Failed to rollback deployment",
            });
        }
    }

    /**
     * Get list of all credentials
     * @param callback - Socket.IO callback
     */
    async getCredentialList(callback: (data: any) => void): Promise<void> {
        try {
            const credentials = await GitCredential.getCredentialList();
            callback({
                ok: true,
                credentials: credentials.map(cred => cred.toJSON()),
            });
        } catch (error) {
            log.error("git-socket", `Error getting credential list: ${error}`);
            callback({
                ok: false,
                error: "Failed to get credential list",
            });
        }
    }

    /**
     * Add a new credential
     * @param data - Credential data
     * @param callback - Socket.IO callback
     */
    async addCredential(data: any, callback: (data: any) => void): Promise<void> {
        try {
            const { name, type, data: credentialData } = data;
            
            // Validate required fields
            if (!name || !type || !credentialData) {
                return callback({
                    ok: false,
                    error: "Name, type, and data are required",
                });
            }
            
            // Create credential
            const credential = R.dispense("git_credential") as GitCredential;
            credential.name = name;
            credential.type = type;
            credential.setEncryptedData(credentialData);
            credential.created_at = new Date();
            credential.updated_at = new Date();
            
            const id = await R.store(credential);
            
            callback({
                ok: true,
                id,
                message: "Credential created successfully",
            });
        } catch (error) {
            log.error("git-socket", `Error adding credential: ${error}`);
            callback({
                ok: false,
                error: "Failed to add credential",
            });
        }
    }

    /**
     * Update a credential
     * @param data - Credential data with ID
     * @param callback - Socket.IO callback
     */
    async updateCredential(data: any, callback: (data: any) => void): Promise<void> {
        try {
            const { id } = data;
            if (!id) {
                return callback({
                    ok: false,
                    error: "Credential ID is required",
                });
            }
            
            const credential = await GitCredential.findById(id);
            
            if (!credential) {
                return callback({
                    ok: false,
                    error: "Credential not found",
                });
            }
            
            const { name, type, data: credentialData } = data;
            
            // Update fields
            if (name !== undefined) credential.name = name;
            if (type !== undefined) credential.type = type;
            if (credentialData !== undefined) credential.setEncryptedData(credentialData);
            
            credential.updated_at = new Date();
            
            await R.store(credential);
            
            callback({
                ok: true,
                message: "Credential updated successfully",
            });
        } catch (error) {
            log.error("git-socket", `Error updating credential: ${error}`);
            callback({
                ok: false,
                error: "Failed to update credential",
            });
        }
    }

    /**
     * Delete a credential
     * @param id - Credential ID
     * @param callback - Socket.IO callback
     */
    async deleteCredential(id: number, callback: (data: any) => void): Promise<void> {
        try {
            const credential = await GitCredential.findById(id);
            
            if (!credential) {
                return callback({
                    ok: false,
                    error: "Credential not found",
                });
            }
            
            // Check if credential is in use by any repository
            const repositories = await R.find("git_repository", " auth_credential_id = ? ", [id]);
            
            if (repositories.length > 0) {
                return callback({
                    ok: false,
                    error: "Credential is in use by repositories",
                });
            }
            
            // Delete credential
            await R.trash(credential);
            
            callback({
                ok: true,
                message: "Credential deleted successfully",
            });
        } catch (error) {
            log.error("git-socket", `Error deleting credential: ${error}`);
            callback({
                ok: false,
                error: "Failed to delete credential",
            });
        }
    }

    /**
     * Emit progress events for long-running operations
     * @param operation - Operation name
     * @param progress - Progress data
     * @private
     */
    private emitProgress(operation: string, progress: GitOperationProgress): void {
        this.socket.emit(`git:${operation}:progress`, progress);
    }
}

export default GitSocketHandler;