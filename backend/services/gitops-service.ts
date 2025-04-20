import path from "path";
import fs from "fs";
import { R } from "redbean-node";
import { GitRepository } from "../models/git-repository";
import { GitCredential } from "../models/git-credential";
import { GitDeployment } from "../models/git-deployment";
import { GitManager } from "../git-manager";
import { log } from "../log";
import { Stack } from "../stack";

interface DeployOptions {
    repositoryId: number;
    filePath: string;
    stackName?: string;
    variables?: Record<string, string>;
    force?: boolean;
}

interface SyncResult {
    success: boolean;
    message: string;
    changedFiles?: string[];
}

/**
 * GitOps Service
 * Manages Git operations for stack deployments
 */
export class GitOpsService {
    private gitManager: GitManager;
    private stacksDir: string;

    /**
     * Create a new GitOpsService
     * @param gitReposDir - Directory for Git repositories
     * @param stacksDir - Directory for stacks
     */
    constructor(gitReposDir?: string, stacksDir?: string) {
        this.gitManager = new GitManager(gitReposDir);
        this.stacksDir = stacksDir || process.env.DOCKGE_STACKS_DIR || "/opt/stacks";
    }

    /**
     * Initialize the GitOps service
     */
    async initialize(): Promise<void> {
        await this.gitManager.initialize();
        
        // Set up scheduled syncs
        this.setupSyncSchedules();
        
        log.info("gitops", "GitOps service initialized");
    }

    /**
     * Deploy a stack from a Git repository
     * @param options - Deployment options
     * @returns Object with success/failure status and message
     */
    async deployFromRepository(options: DeployOptions): Promise<{ success: boolean; message: string; stackName?: string }> {
        try {
            const { repositoryId, filePath, stackName, variables = {}, force = false } = options;
            
            // Get repository
            const repository = await GitRepository.findById(repositoryId);
            if (!repository) {
                return { success: false, message: "Repository not found" };
            }
            
            // Get credential if needed
            let credential: GitCredential | undefined;
            if (repository.auth_credential_id) {
                credential = await GitCredential.findById(repository.auth_credential_id);
            }
            
            // Check if repository is cloned
            const repoPath = this.gitManager.getRepositoryPath(repository.id);
            if (!fs.existsSync(repoPath)) {
                // Clone repository
                const cloneResult = await this.gitManager.cloneRepository(repository, credential);
                if (!cloneResult.success) {
                    return { success: false, message: `Failed to clone repository: ${cloneResult.message}` };
                }
            } else {
                // Fetch latest changes
                const fetchResult = await this.gitManager.fetchRepository(repository, credential);
                if (!fetchResult.success) {
                    return { success: false, message: `Failed to fetch repository: ${fetchResult.message}` };
                }
                
                // Checkout branch
                const checkoutResult = await this.gitManager.checkout(repository, repository.branch || "main");
                if (!checkoutResult.success) {
                    return { success: false, message: `Failed to checkout branch: ${checkoutResult.message}` };
                }
            }
            
            // Get the compose file
            const fileResult = await this.gitManager.getFile(repository, filePath);
            if (!fileResult.success) {
                return { success: false, message: `Failed to get compose file: ${fileResult.message}` };
            }
            
            // Get current commit
            const commitResult = await this.gitManager.getCurrentCommit(repository);
            if (!commitResult.success) {
                return { success: false, message: `Failed to get current commit: ${commitResult.message}` };
            }
            
            // Get commit details for deployment record
            const commitDetails = await this.gitManager.getCommitDetails(repository, commitResult.data);
            
            // Apply variables to the compose file
            let composeContent = fileResult.data;
            if (Object.keys(variables).length > 0) {
                composeContent = this.applyVariables(composeContent, variables);
            }
            
            // Determine stack name from options or from filename
            const finalStackName = stackName || path.basename(filePath, path.extname(filePath));
            
            // Create stack directory if it doesn't exist
            const stackDir = path.join(this.stacksDir, finalStackName);
            await fs.promises.mkdir(stackDir, { recursive: true });
            
            // Write compose file
            const composeFile = path.join(stackDir, "compose.yaml");
            await fs.promises.writeFile(composeFile, composeContent);
            
            // Deploy stack
            const stack = new Stack(finalStackName);
            
            // Check if stack exists and force option
            const stackExists = await stack.exist();
            if (stackExists && !force) {
                return { success: false, message: "Stack already exists. Use force option to redeploy.", stackName: finalStackName };
            }
            
            // Deploy stack
            const deployResult = await stack.deploy();
            
            if (deployResult.contains("Deployed successfully") || deployResult.contains("Started successfully")) {
                // Record deployment
                const deployment = R.dispense("git_deployment") as GitDeployment;
                deployment.repository_id = repository.id;
                deployment.commit_hash = commitResult.data;
                deployment.stack_name = finalStackName;
                deployment.status = "success";
                deployment.message = commitDetails.data?.subject || "Deployed from Git";
                deployment.deployed_at = new Date();
                await R.store(deployment);
                
                // Update repository sync status
                repository.last_sync_status = "success";
                repository.last_sync_time = new Date();
                repository.last_sync_error = "";
                await R.store(repository);
                
                return {
                    success: true,
                    message: `Stack ${finalStackName} deployed successfully from Git`,
                    stackName: finalStackName,
                };
            } else {
                // Record failed deployment
                const deployment = R.dispense("git_deployment") as GitDeployment;
                deployment.repository_id = repository.id;
                deployment.commit_hash = commitResult.data;
                deployment.stack_name = finalStackName;
                deployment.status = "failed";
                deployment.message = "Deployment failed";
                deployment.deployed_at = new Date();
                await R.store(deployment);
                
                // Update repository sync status
                repository.last_sync_status = "failed";
                repository.last_sync_time = new Date();
                repository.last_sync_error = "Deployment failed";
                await R.store(repository);
                
                return {
                    success: false,
                    message: `Failed to deploy stack: ${deployResult}`,
                    stackName: finalStackName,
                };
            }
        } catch (error) {
            log.error("gitops", `Deploy from repository failed: ${error}`);
            return { success: false, message: `Deployment error: ${error}` };
        }
    }

    /**
     * Synchronize a repository and update stacks if needed
     * @param repositoryId - Repository ID
     * @returns Sync result
     */
    async syncRepository(repositoryId: number): Promise<SyncResult> {
        try {
            // Get repository
            const repository = await GitRepository.findById(repositoryId);
            if (!repository) {
                return { success: false, message: "Repository not found" };
            }
            
            // Get credential if needed
            let credential: GitCredential | undefined;
            if (repository.auth_credential_id) {
                credential = await GitCredential.findById(repository.auth_credential_id);
            }
            
            // Check if repository is cloned
            const repoPath = this.gitManager.getRepositoryPath(repository.id);
            if (!fs.existsSync(repoPath)) {
                // Clone repository
                const cloneResult = await this.gitManager.cloneRepository(repository, credential);
                if (!cloneResult.success) {
                    // Update repository sync status
                    repository.last_sync_status = "failed";
                    repository.last_sync_time = new Date();
                    repository.last_sync_error = cloneResult.message;
                    await R.store(repository);
                    
                    return { success: false, message: `Failed to clone repository: ${cloneResult.message}` };
                }
            } else {
                // Fetch latest changes
                const fetchResult = await this.gitManager.fetchRepository(repository, credential);
                if (!fetchResult.success) {
                    // Update repository sync status
                    repository.last_sync_status = "failed";
                    repository.last_sync_time = new Date();
                    repository.last_sync_error = fetchResult.message;
                    await R.store(repository);
                    
                    return { success: false, message: `Failed to fetch repository: ${fetchResult.message}` };
                }
                
                // Checkout branch
                const checkoutResult = await this.gitManager.checkout(repository, repository.branch || "main");
                if (!checkoutResult.success) {
                    // Update repository sync status
                    repository.last_sync_status = "failed";
                    repository.last_sync_time = new Date();
                    repository.last_sync_error = checkoutResult.message;
                    await R.store(repository);
                    
                    return { success: false, message: `Failed to checkout branch: ${checkoutResult.message}` };
                }
            }
            
            // Get all active deployments from this repository
            const deployments = await GitDeployment.getDeploymentsForRepository(repository.id);
            const activeDeployments = deployments.filter(d => d.status === "success");
            
            // Get current commit
            const commitResult = await this.gitManager.getCurrentCommit(repository);
            if (!commitResult.success) {
                return { success: false, message: `Failed to get current commit: ${commitResult.message}` };
            }
            
            // Check if anything has changed
            const changedFiles: string[] = [];
            for (const deployment of activeDeployments) {
                // If commit is the same, nothing has changed for this deployment
                if (deployment.commit_hash === commitResult.data) {
                    continue;
                }
                
                // Record that this file has changed
                changedFiles.push(deployment.stack_name);
            }
            
            // Update repository sync status
            repository.last_sync_status = "success";
            repository.last_sync_time = new Date();
            repository.last_sync_error = "";
            await R.store(repository);
            
            if (changedFiles.length === 0) {
                return { 
                    success: true, 
                    message: "Repository synchronized, no changes detected",
                };
            } else {
                return { 
                    success: true, 
                    message: `Repository synchronized, ${changedFiles.length} changes detected`,
                    changedFiles,
                };
            }
        } catch (error) {
            log.error("gitops", `Repository sync failed: ${error}`);
            return { success: false, message: `Sync error: ${error}` };
        }
    }

    /**
     * Rollback a stack to a previous deployment
     * @param deploymentId - Deployment ID to rollback to
     * @returns Result of rollback operation
     */
    async rollbackToDeployment(deploymentId: number): Promise<{ success: boolean; message: string; stackName?: string }> {
        try {
            // Get deployment
            const deployment = await GitDeployment.findById(deploymentId);
            if (!deployment) {
                return { success: false, message: "Deployment not found" };
            }
            
            // Get repository
            const repository = await GitRepository.findById(deployment.repository_id);
            if (!repository) {
                return { success: false, message: "Repository not found" };
            }
            
            // Get credential if needed
            let credential: GitCredential | undefined;
            if (repository.auth_credential_id) {
                credential = await GitCredential.findById(repository.auth_credential_id);
            }
            
            // Check if repository is cloned
            const repoPath = this.gitManager.getRepositoryPath(repository.id);
            if (!fs.existsSync(repoPath)) {
                // Clone repository
                const cloneResult = await this.gitManager.cloneRepository(repository, credential);
                if (!cloneResult.success) {
                    return { success: false, message: `Failed to clone repository: ${cloneResult.message}` };
                }
            }
            
            // Checkout specific commit
            const checkoutResult = await this.gitManager.checkout(repository, deployment.commit_hash);
            if (!checkoutResult.success) {
                return { success: false, message: `Failed to checkout commit: ${checkoutResult.message}` };
            }
            
            // Find the compose file by scanning repository
            const scanResult = await this.gitManager.scanForComposeFiles(repository);
            if (!scanResult.success) {
                return { success: false, message: `Failed to scan repository: ${scanResult.message}` };
            }
            
            // Find the compose file that corresponds to this stack
            const stackName = deployment.stack_name;
            let composeFile = null;
            
            for (const file of scanResult.data) {
                // Try to match by name
                if (path.basename(file.path, path.extname(file.path)) === stackName) {
                    composeFile = file.path;
                    break;
                }
            }
            
            if (!composeFile) {
                return { success: false, message: `Could not find compose file for stack ${stackName}` };
            }
            
            // Get the compose file
            const fileResult = await this.gitManager.getFile(repository, composeFile);
            if (!fileResult.success) {
                return { success: false, message: `Failed to get compose file: ${fileResult.message}` };
            }
            
            // Create stack directory if it doesn't exist
            const stackDir = path.join(this.stacksDir, stackName);
            await fs.promises.mkdir(stackDir, { recursive: true });
            
            // Write compose file
            const composeFileDest = path.join(stackDir, "compose.yaml");
            await fs.promises.writeFile(composeFileDest, fileResult.data);
            
            // Deploy stack
            const stack = new Stack(stackName);
            const deployResult = await stack.deploy();
            
            if (deployResult.contains("Deployed successfully") || deployResult.contains("Started successfully")) {
                // Record deployment
                const newDeployment = R.dispense("git_deployment") as GitDeployment;
                newDeployment.repository_id = repository.id;
                newDeployment.commit_hash = deployment.commit_hash;
                newDeployment.stack_name = stackName;
                newDeployment.status = "success";
                newDeployment.message = `Rollback to deployment ${deploymentId}`;
                newDeployment.deployed_at = new Date();
                await R.store(newDeployment);
                
                return {
                    success: true,
                    message: `Stack ${stackName} rolled back successfully to deployment ${deploymentId}`,
                    stackName,
                };
            } else {
                // Record failed deployment
                const newDeployment = R.dispense("git_deployment") as GitDeployment;
                newDeployment.repository_id = repository.id;
                newDeployment.commit_hash = deployment.commit_hash;
                newDeployment.stack_name = stackName;
                newDeployment.status = "failed";
                newDeployment.message = `Rollback to deployment ${deploymentId} failed`;
                newDeployment.deployed_at = new Date();
                await R.store(newDeployment);
                
                return {
                    success: false,
                    message: `Failed to rollback stack: ${deployResult}`,
                    stackName,
                };
            }
        } catch (error) {
            log.error("gitops", `Rollback to deployment failed: ${error}`);
            return { success: false, message: `Rollback error: ${error}` };
        }
    }

    /**
     * Set up scheduled synchronization for repositories
     * @private
     */
    private setupSyncSchedules(): void {
        // Check every minute for repositories that need syncing
        setInterval(async () => {
            try {
                const repositories = await GitRepository.getRepositoryList();
                
                for (const repository of repositories) {
                    // Skip repositories with sync disabled
                    if (!repository.sync_interval || repository.sync_interval <= 0) {
                        continue;
                    }
                    
                    // Check if it's time to sync
                    const lastSync = repository.last_sync_time ? new Date(repository.last_sync_time) : null;
                    const now = new Date();
                    
                    if (!lastSync || (now.getTime() - lastSync.getTime() >= repository.sync_interval * 60 * 1000)) {
                        log.info("gitops", `Running scheduled sync for repository ${repository.name} (${repository.id})`);
                        
                        // Sync repository
                        await this.syncRepository(repository.id);
                    }
                }
            } catch (error) {
                log.error("gitops", `Error in sync schedule: ${error}`);
            }
        }, 60000); // Check every minute
    }

    /**
     * Apply variables to compose file content
     * @param content - Compose file content
     * @param variables - Variables to apply
     * @returns Modified compose file content
     * @private
     */
    private applyVariables(content: string, variables: Record<string, string>): string {
        let result = content;
        
        // Replace ${VAR} style variables
        for (const [key, value] of Object.entries(variables)) {
            const regex = new RegExp(`\\$\\{${key}\\}`, "g");
            result = result.replace(regex, value);
        }
        
        return result;
    }
}

export default GitOpsService;