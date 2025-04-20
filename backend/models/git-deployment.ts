import { BeanModel } from "redbean-node/dist/bean-model";
import { R } from "redbean-node";
import { LooseObject } from "../../common/util-common";

/**
 * Git Deployment Model
 * Tracks deployments from Git repositories
 */
export class GitDeployment extends BeanModel {
    /**
     * Get deployments for a repository
     * @param repositoryId - Repository ID
     * @param limit - Maximum number of records to return
     * @returns Promise with deployments for the repository
     */
    static async getDeploymentsForRepository(repositoryId: number, limit = 50): Promise<GitDeployment[]> {
        return await R.find(
            "git_deployment", 
            " repository_id = ? ORDER BY deployed_at DESC LIMIT ?", 
            [repositoryId, limit]
        ) as GitDeployment[];
    }

    /**
     * Get latest deployment for a stack
     * @param stackName - Name of the stack
     * @returns Latest deployment or null if none found
     */
    static async getLatestForStack(stackName: string): Promise<GitDeployment | null> {
        return await R.findOne(
            "git_deployment",
            " stack_name = ? ORDER BY deployed_at DESC",
            [stackName]
        ) as GitDeployment | null;
    }

    /**
     * Find deployment by ID
     * @param id - Deployment ID
     * @returns Deployment or null if not found
     */
    static async findById(id: number): Promise<GitDeployment | null> {
        return await R.findOne("git_deployment", " id = ? ", [id]) as GitDeployment | null;
    }

    /**
     * Convert deployment to JSON
     * @returns Deployment data as object
     */
    toJSON(): LooseObject {
        return {
            id: this.id,
            repositoryId: this.repository_id,
            commitHash: this.commit_hash,
            stackName: this.stack_name,
            status: this.status,
            message: this.message,
            deployedAt: this.deployed_at,
        };
    }
}

export default GitDeployment;