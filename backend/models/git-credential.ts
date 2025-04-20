import { BeanModel } from "redbean-node/dist/bean-model";
import { R } from "redbean-node";
import { LooseObject } from "../../common/util-common";
import crypto from "crypto";

/**
 * Git Credential Model
 * Manages authentication credentials for Git repositories
 */
export class GitCredential extends BeanModel {
    /**
     * Encryption key for credential data
     * This should be replaced with a secure configuration approach
     * @private
     */
    private static readonly ENCRYPTION_KEY = process.env.DOCKGE_GIT_CRED_KEY || "default-key-replace-in-production";

    /**
     * Get all credentials
     * @returns Promise with all credentials
     */
    static async getCredentialList(): Promise<GitCredential[]> {
        return await R.findAll("git_credential") as GitCredential[];
    }

    /**
     * Find credential by ID
     * @param id - Credential ID
     * @returns Credential or null if not found
     */
    static async findById(id: number): Promise<GitCredential | null> {
        return await R.findOne("git_credential", " id = ? ", [id]) as GitCredential | null;
    }

    /**
     * Encrypt sensitive credential data
     * @param data - Data to encrypt
     * @returns Encrypted data
     */
    static encryptData(data: string): string {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv(
            'aes-256-cbc',
            Buffer.from(this.ENCRYPTION_KEY.padEnd(32).slice(0, 32)),
            iv
        );
        
        let encrypted = cipher.update(data, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        
        return iv.toString('hex') + ':' + encrypted;
    }

    /**
     * Decrypt sensitive credential data
     * @param encryptedData - Data to decrypt
     * @returns Decrypted data
     */
    static decryptData(encryptedData: string): string {
        const parts = encryptedData.split(':');
        if (parts.length !== 2) {
            throw new Error("Invalid encrypted data format");
        }
        
        const iv = Buffer.from(parts[0], 'hex');
        const encryptedText = parts[1];
        
        const decipher = crypto.createDecipheriv(
            'aes-256-cbc',
            Buffer.from(this.ENCRYPTION_KEY.padEnd(32).slice(0, 32)),
            iv
        );
        
        let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        
        return decrypted;
    }

    /**
     * Get decrypted data
     * @returns Decrypted credential data
     */
    getDecryptedData(): string {
        if (!this.data) {
            return "";
        }
        return GitCredential.decryptData(this.data);
    }

    /**
     * Set encrypted data
     * @param data - Data to encrypt and store
     */
    setEncryptedData(data: string): void {
        this.data = GitCredential.encryptData(data);
    }

    /**
     * Convert credential to JSON
     * @param includeData - Whether to include decrypted data (default: false)
     * @returns Credential as object
     */
    toJSON(includeData = false): LooseObject {
        const result: LooseObject = {
            id: this.id,
            name: this.name,
            type: this.type,
            createdAt: this.created_at,
            updatedAt: this.updated_at,
        };

        if (includeData) {
            result.data = this.getDecryptedData();
        }

        return result;
    }
}

export default GitCredential;