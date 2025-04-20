import fs from "fs";
import path from "path";
import { promisify } from "util";
import { spawn, exec as execCallback } from "child_process";
import { GitRepository } from "./models/git-repository";
import { GitCredential } from "./models/git-credential";
import { log } from "./log";
import * as os from "os";

const exec = promisify(execCallback);
const fsPromises = fs.promises;

interface GitOperationResult {
    success: boolean;
    message: string;
    data?: any;
}

/**
 * Git Manager
 * Handles Git operations for repositories
 */
export class GitManager {
    private baseDir: string;

    /**
     * Create a new GitManager
     * @param baseDir - Base directory for Git repositories
     */
    constructor(baseDir?: string) {
        // Set default directory to /opt/git-repositories or use environment variable
        this.baseDir = baseDir || process.env.DOCKGE_GIT_REPOSITORIES_DIR || "/opt/git-repositories";
    }

    /**
     * Initialize the Git manager
     * Creates the base directory if it doesn't exist
     */
    async initialize(): Promise<void> {
        try {
            await fsPromises.mkdir(this.baseDir, { recursive: true });
            log.info("git", `Git repositories directory initialized: ${this.baseDir}`);
        } catch (error) {
            log.error("git", `Failed to initialize Git repositories directory: ${error}`);
            throw error;
        }
    }

    /**
     * Get the repository directory path
     * @param repositoryId - Repository ID
     * @returns Full path to the repository directory
     */
    getRepositoryPath(repositoryId: number): string {
        return path.join(this.baseDir, `repo-${repositoryId}`);
    }

    /**
     * Clone a repository
     * @param repository - Repository object
     * @param credential - Optional credential for authentication
     * @returns Operation result
     */
    async cloneRepository(
        repository: GitRepository,
        credential?: GitCredential
    ): Promise<GitOperationResult> {
        const repoPath = this.getRepositoryPath(repository.id);

        try {
            // Check if directory already exists
            if (fs.existsSync(repoPath)) {
                return { 
                    success: false, 
                    message: "Repository directory already exists" 
                };
            }

            // Create parent directory
            await fsPromises.mkdir(path.dirname(repoPath), { recursive: true });

            const url = repository.url;
            const branch = repository.branch || "main";

            // Set up auth if needed
            let env = { ...process.env };
            let cloneArgs = ["clone", "--branch", branch];

            if (credential && repository.auth_type !== "none") {
                const authResult = await this.setupAuthentication(repository, credential, env);
                if (!authResult.success) {
                    return authResult;
                }
            }

            // Add depth for faster cloning
            cloneArgs.push("--depth", "1");
            cloneArgs.push(url, repoPath);

            // Execute git clone
            const result = await this.executeGitCommand(cloneArgs, path.dirname(repoPath), env);
            
            if (result.success) {
                log.info("git", `Successfully cloned repository ${repository.name} (${repository.id})`);
                return {
                    success: true,
                    message: "Repository cloned successfully",
                };
            } else {
                return result;
            }
        } catch (error) {
            log.error("git", `Failed to clone repository: ${error}`);
            return {
                success: false,
                message: `Failed to clone repository: ${error}`,
            };
        }
    }

    /**
     * Fetch latest changes from remote
     * @param repository - Repository object
     * @param credential - Optional credential for authentication
     * @returns Operation result
     */
    async fetchRepository(
        repository: GitRepository,
        credential?: GitCredential
    ): Promise<GitOperationResult> {
        const repoPath = this.getRepositoryPath(repository.id);

        try {
            // Check if directory exists
            if (!fs.existsSync(repoPath)) {
                return {
                    success: false,
                    message: "Repository directory doesn't exist, please clone first",
                };
            }

            // Set up auth if needed
            let env = { ...process.env };
            
            if (credential && repository.auth_type !== "none") {
                const authResult = await this.setupAuthentication(repository, credential, env);
                if (!authResult.success) {
                    return authResult;
                }
            }

            // Execute git fetch
            const result = await this.executeGitCommand(["fetch", "--all"], repoPath, env);
            
            if (result.success) {
                log.info("git", `Successfully fetched repository ${repository.name} (${repository.id})`);
                return {
                    success: true,
                    message: "Repository fetched successfully",
                };
            } else {
                return result;
            }
        } catch (error) {
            log.error("git", `Failed to fetch repository: ${error}`);
            return {
                success: false,
                message: `Failed to fetch repository: ${error}`,
            };
        }
    }

    /**
     * Checkout a specific branch, tag, or commit
     * @param repository - Repository object
     * @param ref - Git reference (branch, tag, or commit)
     * @returns Operation result
     */
    async checkout(
        repository: GitRepository,
        ref: string
    ): Promise<GitOperationResult> {
        const repoPath = this.getRepositoryPath(repository.id);

        try {
            // Check if directory exists
            if (!fs.existsSync(repoPath)) {
                return {
                    success: false,
                    message: "Repository directory doesn't exist, please clone first",
                };
            }

            // Execute git checkout
            const result = await this.executeGitCommand(["checkout", ref], repoPath);
            
            if (result.success) {
                // Pull latest changes if checking out a branch
                const pullResult = await this.executeGitCommand(["pull"], repoPath);
                if (!pullResult.success) {
                    log.warn("git", `Failed to pull after checkout: ${pullResult.message}`);
                }

                log.info("git", `Successfully checked out ${ref} for repository ${repository.name} (${repository.id})`);
                return {
                    success: true,
                    message: `Successfully checked out ${ref}`,
                };
            } else {
                return result;
            }
        } catch (error) {
            log.error("git", `Failed to checkout ref: ${error}`);
            return {
                success: false,
                message: `Failed to checkout ref: ${error}`,
            };
        }
    }

    /**
     * Get the current commit hash
     * @param repository - Repository object
     * @returns Operation result with commit hash in data
     */
    async getCurrentCommit(repository: GitRepository): Promise<GitOperationResult> {
        const repoPath = this.getRepositoryPath(repository.id);

        try {
            // Check if directory exists
            if (!fs.existsSync(repoPath)) {
                return {
                    success: false,
                    message: "Repository directory doesn't exist, please clone first",
                };
            }

            // Execute git rev-parse HEAD
            const result = await this.executeGitCommand(["rev-parse", "HEAD"], repoPath);
            
            if (result.success && result.data) {
                const commitHash = result.data.trim();
                return {
                    success: true,
                    message: "Successfully retrieved current commit hash",
                    data: commitHash,
                };
            } else {
                return {
                    success: false,
                    message: "Failed to get current commit hash",
                };
            }
        } catch (error) {
            log.error("git", `Failed to get current commit: ${error}`);
            return {
                success: false,
                message: `Failed to get current commit: ${error}`,
            };
        }
    }

    /**
     * Get commit details
     * @param repository - Repository object
     * @param commitHash - Commit hash
     * @returns Operation result with commit details in data
     */
    async getCommitDetails(
        repository: GitRepository,
        commitHash: string
    ): Promise<GitOperationResult> {
        const repoPath = this.getRepositoryPath(repository.id);

        try {
            // Check if directory exists
            if (!fs.existsSync(repoPath)) {
                return {
                    success: false,
                    message: "Repository directory doesn't exist, please clone first",
                };
            }

            // Execute git show
            const result = await this.executeGitCommand(
                ["show", "--pretty=format:%H%n%an%n%ae%n%ct%n%s%n%b", "--no-patch", commitHash],
                repoPath
            );
            
            if (result.success && result.data) {
                const lines = result.data.trim().split("\n");
                if (lines.length >= 5) {
                    const [hash, author, email, timestamp, subject, ...bodyLines] = lines;
                    const body = bodyLines.join("\n");
                    
                    return {
                        success: true,
                        message: "Successfully retrieved commit details",
                        data: {
                            hash,
                            author,
                            email,
                            timestamp: parseInt(timestamp) * 1000, // Convert to milliseconds
                            subject,
                            body,
                        },
                    };
                } else {
                    return {
                        success: false,
                        message: "Invalid commit details format",
                    };
                }
            } else {
                return {
                    success: false,
                    message: "Failed to get commit details",
                };
            }
        } catch (error) {
            log.error("git", `Failed to get commit details: ${error}`);
            return {
                success: false,
                message: `Failed to get commit details: ${error}`,
            };
        }
    }

    /**
     * Scan for Docker Compose files in a repository
     * @param repository - Repository object
     * @returns Operation result with compose files in data
     */
    async scanForComposeFiles(repository: GitRepository): Promise<GitOperationResult> {
        const repoPath = this.getRepositoryPath(repository.id);
        const searchPath = repository.path ? path.join(repoPath, repository.path) : repoPath;

        try {
            // Check if directory exists
            if (!fs.existsSync(repoPath)) {
                return {
                    success: false,
                    message: "Repository directory doesn't exist, please clone first",
                };
            }

            if (!fs.existsSync(searchPath)) {
                return {
                    success: false,
                    message: `Path ${repository.path} doesn't exist in repository`,
                };
            }

            // Find all yaml/yml files
            const { stdout } = await exec(`find "${searchPath}" -type f -name "docker-compose*.y*ml" -o -name "compose.y*ml"`, { maxBuffer: 10 * 1024 * 1024 });
            const files = stdout.trim().split("\n").filter(Boolean);

            // Analyze each file to confirm it's a compose file
            const composeFiles = [];
            for (const file of files) {
                try {
                    const content = await fsPromises.readFile(file, "utf-8");
                    // Simple check for docker-compose format by looking for common keys
                    if (content.includes("version:") || content.includes("services:")) {
                        const relativePath = path.relative(repoPath, file);
                        composeFiles.push({
                            path: relativePath,
                            name: path.basename(file),
                            fullPath: file,
                        });
                    }
                } catch (err) {
                    log.warn("git", `Error reading file ${file}: ${err}`);
                }
            }

            return {
                success: true,
                message: `Found ${composeFiles.length} Docker Compose files`,
                data: composeFiles,
            };
        } catch (error) {
            log.error("git", `Failed to scan for compose files: ${error}`);
            return {
                success: false,
                message: `Failed to scan for compose files: ${error}`,
            };
        }
    }

    /**
     * Get a specific file from repository
     * @param repository - Repository object
     * @param filePath - Path to file within repository
     * @returns Operation result with file content in data
     */
    async getFile(
        repository: GitRepository,
        filePath: string
    ): Promise<GitOperationResult> {
        const repoPath = this.getRepositoryPath(repository.id);
        const fullPath = path.join(repoPath, filePath);

        try {
            // Check if file exists
            if (!fs.existsSync(fullPath)) {
                return {
                    success: false,
                    message: `File ${filePath} doesn't exist in repository`,
                };
            }

            // Read file
            const content = await fsPromises.readFile(fullPath, "utf-8");

            return {
                success: true,
                message: "Successfully read file",
                data: content,
            };
        } catch (error) {
            log.error("git", `Failed to read file: ${error}`);
            return {
                success: false,
                message: `Failed to read file: ${error}`,
            };
        }
    }

    /**
     * Setup authentication for Git operations
     * @param repository - Repository object
     * @param credential - Credential for authentication
     * @param env - Environment variables object to modify
     * @returns Operation result
     * @private
     */
    private async setupAuthentication(
        repository: GitRepository,
        credential: GitCredential,
        env: NodeJS.ProcessEnv
    ): Promise<GitOperationResult> {
        try {
            const authType = repository.auth_type;
            
            if (authType === "ssh") {
                // Set up SSH auth
                const sshKeyData = credential.getDecryptedData();
                const sshDir = path.join(os.tmpdir(), `dockge-ssh-${repository.id}`);
                const sshKeyPath = path.join(sshDir, "id_rsa");
                
                // Create dir and save key
                await fsPromises.mkdir(sshDir, { recursive: true, mode: 0o700 });
                await fsPromises.writeFile(sshKeyPath, sshKeyData, { mode: 0o600 });
                
                // Set SSH key in env
                env.GIT_SSH_COMMAND = `ssh -i ${sshKeyPath} -o StrictHostKeyChecking=no`;
                
                return {
                    success: true,
                    message: "SSH authentication set up successfully",
                };
            } else if (authType === "token") {
                // Set up token auth (usually for HTTPS)
                const tokenData = credential.getDecryptedData();
                
                // Parse URL to inject token
                const url = new URL(repository.url);
                
                if (url.protocol.startsWith("http")) {
                    // Format: https://token@github.com/user/repo
                    url.username = tokenData;
                    
                    // Update env
                    env.GIT_ASKPASS = "echo";
                    env.GIT_TERMINAL_PROMPT = "0";
                    
                    // Store updated URL in repository for this operation
                    repository.url = url.toString();
                    
                    return {
                        success: true,
                        message: "Token authentication set up successfully",
                    };
                } else {
                    return {
                        success: false,
                        message: "Token authentication requires HTTPS URL",
                    };
                }
            } else {
                return {
                    success: false,
                    message: `Unsupported authentication type: ${authType}`,
                };
            }
        } catch (error) {
            log.error("git", `Authentication setup failed: ${error}`);
            return {
                success: false,
                message: `Authentication setup failed: ${error}`,
            };
        }
    }

    /**
     * Execute a Git command
     * @param args - Git command arguments
     * @param cwd - Working directory
     * @param env - Environment variables
     * @returns Operation result
     * @private
     */
    private executeGitCommand(
        args: string[],
        cwd: string,
        env: NodeJS.ProcessEnv = process.env
    ): Promise<GitOperationResult> {
        return new Promise((resolve) => {
            log.debug("git", `Executing: git ${args.join(" ")}`);
            
            const child = spawn("git", args, {
                cwd,
                env,
                stdio: ["ignore", "pipe", "pipe"],
            });
            
            let stdout = "";
            let stderr = "";
            
            child.stdout.on("data", (data) => {
                stdout += data.toString();
            });
            
            child.stderr.on("data", (data) => {
                stderr += data.toString();
            });
            
            child.on("close", (code) => {
                if (code === 0) {
                    resolve({
                        success: true,
                        message: "Command executed successfully",
                        data: stdout,
                    });
                } else {
                    log.error("git", `Command failed with code ${code}: ${stderr}`);
                    resolve({
                        success: false,
                        message: stderr || `Command exited with code ${code}`,
                    });
                }
            });
            
            child.on("error", (error) => {
                log.error("git", `Command error: ${error}`);
                resolve({
                    success: false,
                    message: `Command error: ${error}`,
                });
            });
        });
    }
}

export default GitManager;