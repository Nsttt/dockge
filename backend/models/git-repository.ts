import { BeanModel } from "redbean-node/dist/bean-model";
import { R } from "redbean-node";
import { LooseObject } from "../../common/util-common";

/**
 * Git Repository Model
 * Represents a Git repository used for GitOps
 */
export class GitRepository extends BeanModel {

    /**
     * Get list of all repositories
     * @returns Promise containing all repositories
     */
    static async getRepositoryList(): Promise<GitRepository[]> {
        return await R.findAll("git_repository") as GitRepository[];
    }

    /**
     * Get repositories by agent ID
     * @param agentId - Agent ID or null for local repositories
     * @returns Promise containing repositories for the specified agent
     */
    static async getRepositoriesByAgent(agentId: number | null): Promise<GitRepository[]> {
        if (agentId) {
            return await R.find("git_repository", " agent_id = ? ", [agentId]) as GitRepository[];
        } else {
            return await R.find("git_repository", " agent_id IS NULL ") as GitRepository[];
        }
    }

    /**
     * Find repository by ID
     * @param id - Repository ID
     * @returns Repository or null if not found
     */
    static async findById(id: number): Promise<GitRepository | null> {
        return await R.findOne("git_repository", " id = ? ", [id]) as GitRepository | null;
    }

    /**
     * Convert repository to JSON
     * @returns Repository data as object
     */
    toJSON(): LooseObject {
        return {
            id: this.id,
            name: this.name,
            url: this.url,
            branch: this.branch,
            agentId: this.agent_id,
            authType: this.auth_type,
            authCredentialId: this.auth_credential_id,
            path: this.path,
            syncInterval: this.sync_interval,
            lastSyncTime: this.last_sync_time,
            lastSyncStatus: this.last_sync_status,
            lastSyncError: this.last_sync_error,
            createdAt: this.created_at,
            updatedAt: this.updated_at,
        };
    }
}

export default GitRepository;