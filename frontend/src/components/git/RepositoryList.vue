<template>
    <div>
        <div class="d-flex justify-content-between align-items-center mb-3">
            <h2>{{ $t("Git Repositories") }}</h2>
            <div>
                <b-button variant="primary" @click="showAddForm">
                    <font-awesome-icon icon="plus" /> {{ $t("Add Repository") }}
                </b-button>
            </div>
        </div>

        <b-alert :show="errorMsg !== null" variant="danger" dismissible @dismissed="errorMsg = null">
            {{ errorMsg }}
        </b-alert>

        <b-card v-if="loading" body-class="text-center py-4">
            <font-awesome-icon icon="spinner" spin size="2x" class="text-primary" />
            <p class="mt-3 text-muted">{{ $t("Loading repositories...") }}</p>
        </b-card>

        <div v-else-if="repositories.length === 0" class="text-center p-5 bg-light rounded">
            <div class="mb-3">
                <font-awesome-icon icon="code-branch" class="text-muted" style="width: 3rem; height: 3rem;" />
            </div>
            <h4 class="text-muted">{{ $t("No Git repositories found") }}</h4>
            <p class="text-muted">{{ $t("Add a Git repository to deploy stacks using GitOps") }}</p>
            <b-button variant="primary" @click="showAddForm">
                <font-awesome-icon icon="plus" /> {{ $t("Add Repository") }}
            </b-button>
        </div>

        <div v-else>
            <div class="repo-list">
                <b-card v-for="repo in repositories" :key="repo.id" class="mb-3">
                    <div class="d-flex justify-content-between align-items-start">
                        <div>
                            <h4 class="mb-1">{{ repo.name }}</h4>
                            <div class="text-muted small">{{ repo.url }}</div>
                            <div class="mt-2">
                                <b-badge variant="info" class="mr-2">
                                    <font-awesome-icon icon="code-branch" /> {{ repo.branch }}
                                </b-badge>
                                <b-badge variant="secondary" v-if="repo.agentId">
                                    <font-awesome-icon icon="server" /> {{ getAgentName(repo.agentId) }}
                                </b-badge>
                                <b-badge variant="secondary" v-else>
                                    <font-awesome-icon icon="home" /> {{ $t("Local") }}
                                </b-badge>
                            </div>
                        </div>
                        <div class="d-flex">
                            <b-button-group size="sm">
                                <b-button variant="outline-primary" @click="syncRepository(repo)">
                                    <font-awesome-icon icon="arrows-rotate" /> {{ $t("Sync") }}
                                </b-button>
                                <b-button variant="outline-success" @click="showDeployForm(repo)">
                                    <font-awesome-icon icon="cloud-arrow-down" /> {{ $t("Deploy") }}
                                </b-button>
                                <b-button variant="outline-info" @click="showDeployments(repo)">
                                    <font-awesome-icon icon="clock" /> {{ $t("History") }}
                                </b-button>
                                <b-button variant="outline-secondary" @click="editRepository(repo)">
                                    <font-awesome-icon icon="pen" />
                                </b-button>
                                <b-button variant="outline-danger" @click="confirmDelete(repo)">
                                    <font-awesome-icon icon="trash" />
                                </b-button>
                            </b-button-group>
                        </div>
                    </div>
                    
                    <div v-if="repo.lastSyncTime" class="mt-3 d-flex align-items-center">
                        <span class="text-muted small mr-2">{{ $t("Last sync") }}:</span>
                        <span v-if="repo.lastSyncStatus === 'success'" class="text-success small mr-2">
                            <font-awesome-icon icon="check-circle" /> {{ formatDate(repo.lastSyncTime) }}
                        </span>
                        <span v-else-if="repo.lastSyncStatus === 'failed'" class="text-danger small mr-2">
                            <font-awesome-icon icon="times-circle" /> {{ formatDate(repo.lastSyncTime) }}
                        </span>
                        <span v-else class="text-muted small mr-2">
                            {{ formatDate(repo.lastSyncTime) }}
                        </span>
                        <span v-if="repo.lastSyncError" class="text-danger small">
                            {{ repo.lastSyncError }}
                        </span>
                    </div>
                </b-card>
            </div>
        </div>

        <!-- Repository Form Modal -->
        <b-modal
            v-model="showForm"
            :title="editMode ? $t('Edit Repository') : $t('Add Repository')"
            @hidden="resetForm"
            hide-footer
            size="lg"
        >
            <b-form @submit.prevent="saveRepository">
                <b-form-group :label="$t('Repository Name')">
                    <b-form-input v-model="form.name" required />
                </b-form-group>

                <b-form-group :label="$t('Repository URL')">
                    <b-form-input v-model="form.url" required type="url" />
                    <small class="form-text text-muted">
                        {{ $t("SSH or HTTPS URL to the Git repository") }}
                    </small>
                </b-form-group>

                <b-form-group :label="$t('Branch')">
                    <b-form-input v-model="form.branch" placeholder="main" />
                </b-form-group>

                <b-form-group :label="$t('Agent')">
                    <b-form-select v-model="form.agentId">
                        <option :value="null">{{ $t("Local") }}</option>
                        <option v-for="agent in agents" :key="agent.endpoint" :value="agent.id">
                            {{ agent.endpoint }}
                        </option>
                    </b-form-select>
                </b-form-group>

                <b-form-group :label="$t('Path')">
                    <b-form-input v-model="form.path" placeholder="" />
                    <small class="form-text text-muted">
                        {{ $t("Optional subdirectory within the repository") }}
                    </small>
                </b-form-group>

                <b-form-group :label="$t('Authentication')">
                    <b-form-select v-model="form.authType">
                        <option value="none">{{ $t("None") }}</option>
                        <option value="ssh">{{ $t("SSH Key") }}</option>
                        <option value="token">{{ $t("Access Token") }}</option>
                    </b-form-select>
                </b-form-group>

                <b-form-group v-if="form.authType !== 'none'" :label="$t('Credential')">
                    <div class="d-flex">
                        <b-form-select v-model="form.authCredentialId" class="flex-grow-1 mr-2">
                            <option v-for="cred in credentials" :key="cred.id" :value="cred.id">
                                {{ cred.name }}
                            </option>
                        </b-form-select>
                        <b-button variant="outline-primary" @click="showAddCredential">
                            <font-awesome-icon icon="plus" /> {{ $t("Add") }}
                        </b-button>
                    </div>
                </b-form-group>

                <b-form-group :label="$t('Auto Sync Interval (minutes)')">
                    <b-form-input v-model.number="form.syncInterval" type="number" min="0" />
                    <small class="form-text text-muted">
                        {{ $t("Set to 0 to disable automatic sync") }}
                    </small>
                </b-form-group>

                <div class="d-flex justify-content-end mt-3">
                    <b-button variant="secondary" class="mr-2" @click="showForm = false">
                        {{ $t("Cancel") }}
                    </b-button>
                    <b-button type="submit" variant="primary" :disabled="formLoading">
                        <font-awesome-icon v-if="formLoading" icon="spinner" spin />
                        {{ editMode ? $t("Update") : $t("Add") }}
                    </b-button>
                </div>
            </b-form>
        </b-modal>

        <!-- Credential Form Modal -->
        <b-modal
            v-model="showCredForm"
            :title="$t('Add Credential')"
            @hidden="resetCredForm"
            hide-footer
        >
            <b-form @submit.prevent="saveCredential">
                <b-form-group :label="$t('Credential Name')">
                    <b-form-input v-model="credForm.name" required />
                </b-form-group>

                <b-form-group :label="$t('Credential Type')">
                    <b-form-select v-model="credForm.type" required>
                        <option value="ssh">{{ $t("SSH Key") }}</option>
                        <option value="token">{{ $t("Access Token") }}</option>
                    </b-form-select>
                </b-form-group>

                <b-form-group :label="credForm.type === 'ssh' ? $t('SSH Private Key') : $t('Access Token')">
                    <b-form-textarea 
                        v-if="credForm.type === 'ssh'" 
                        v-model="credForm.data" 
                        required 
                        rows="10"
                        placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                    />
                    <b-form-input 
                        v-else 
                        v-model="credForm.data" 
                        required 
                        placeholder="ghp_1234567890abcdef"
                    />
                </b-form-group>

                <div class="d-flex justify-content-end mt-3">
                    <b-button variant="secondary" class="mr-2" @click="showCredForm = false">
                        {{ $t("Cancel") }}
                    </b-button>
                    <b-button type="submit" variant="primary" :disabled="credFormLoading">
                        <font-awesome-icon v-if="credFormLoading" icon="spinner" spin />
                        {{ $t("Add") }}
                    </b-button>
                </div>
            </b-form>
        </b-modal>

        <!-- Deploy Modal -->
        <b-modal
            v-model="showDeploy"
            :title="$t('Deploy from Git')"
            @hidden="resetDeployForm"
            hide-footer
            size="lg"
        >
            <b-form @submit.prevent="deployRepository">
                <b-alert :show="deployErrorMsg !== null" variant="danger" dismissible @dismissed="deployErrorMsg = null">
                    {{ deployErrorMsg }}
                </b-alert>

                <div v-if="deployLoading" class="text-center py-4">
                    <font-awesome-icon icon="spinner" spin size="2x" class="text-primary" />
                    <p class="mt-3 text-muted">{{ deployLoadingMsg }}</p>
                </div>
                
                <div v-else>
                    <div v-if="composeFiles.length === 0" class="text-center p-4 bg-light rounded mb-3">
                        <p class="text-muted">{{ $t("No Docker Compose files found in this repository") }}</p>
                        <b-button variant="primary" @click="scanRepository(selectedRepository)">
                            <font-awesome-icon icon="arrows-rotate" /> {{ $t("Scan Again") }}
                        </b-button>
                    </div>
                    
                    <div v-else>
                        <b-form-group :label="$t('Compose File')">
                            <b-form-select v-model="deployForm.filePath" required>
                                <option v-for="file in composeFiles" :key="file.path" :value="file.path">
                                    {{ file.path }}
                                </option>
                            </b-form-select>
                        </b-form-group>

                        <b-form-group :label="$t('Stack Name')" description="Leave empty to use filename">
                            <b-form-input v-model="deployForm.stackName" />
                        </b-form-group>

                        <b-form-group :label="$t('Variables')">
                            <div v-for="(variable, index) in deployForm.variables" :key="index" class="d-flex mb-2">
                                <b-form-input
                                    v-model="variable.key"
                                    placeholder="Key"
                                    class="mr-2"
                                />
                                <b-form-input
                                    v-model="variable.value"
                                    placeholder="Value"
                                    class="mr-2"
                                />
                                <b-button variant="outline-danger" @click="removeVariable(index)">
                                    <font-awesome-icon icon="trash" />
                                </b-button>
                            </div>
                            <b-button variant="outline-secondary" size="sm" @click="addVariable">
                                <font-awesome-icon icon="plus" /> {{ $t("Add Variable") }}
                            </b-button>
                        </b-form-group>

                        <b-form-group>
                            <b-form-checkbox v-model="deployForm.force">
                                {{ $t("Force deployment (overwrite existing stack)") }}
                            </b-form-checkbox>
                        </b-form-group>

                        <div class="d-flex justify-content-end mt-3">
                            <b-button variant="secondary" class="mr-2" @click="showDeploy = false">
                                {{ $t("Cancel") }}
                            </b-button>
                            <b-button type="submit" variant="primary" :disabled="deployFormSubmitting">
                                <font-awesome-icon v-if="deployFormSubmitting" icon="spinner" spin />
                                {{ $t("Deploy") }}
                            </b-button>
                        </div>
                    </div>
                </div>
            </b-form>
        </b-modal>

        <!-- Delete Confirmation Modal -->
        <b-modal
            v-model="showDelete"
            :title="$t('Delete Repository')"
            @hidden="selectedRepository = null"
            hide-footer
        >
            <p>{{ $t("Are you sure you want to delete this repository?") }}</p>
            <p class="font-weight-bold" v-if="selectedRepository">{{ selectedRepository.name }}</p>
            <p class="text-danger">{{ $t("This will not delete any deployed stacks.") }}</p>
            
            <div class="d-flex justify-content-end mt-3">
                <b-button variant="secondary" class="mr-2" @click="showDelete = false">
                    {{ $t("Cancel") }}
                </b-button>
                <b-button variant="danger" @click="deleteRepository" :disabled="deleteLoading">
                    <font-awesome-icon v-if="deleteLoading" icon="spinner" spin />
                    {{ $t("Delete") }}
                </b-button>
            </div>
        </b-modal>

        <!-- Deployments History Modal -->
        <b-modal
            v-model="showHistory"
            :title="$t('Deployment History')"
            size="lg"
            hide-footer
        >
            <div v-if="deploymentsLoading" class="text-center py-4">
                <font-awesome-icon icon="spinner" spin size="2x" class="text-primary" />
                <p class="mt-3 text-muted">{{ $t("Loading deployments...") }}</p>
            </div>
            
            <div v-else-if="deployments.length === 0" class="text-center p-4 bg-light rounded">
                <p class="text-muted">{{ $t("No deployments found for this repository") }}</p>
            </div>
            
            <div v-else>
                <b-table striped hover :items="deployments" :fields="deploymentFields">
                    <template #cell(status)="data">
                        <b-badge :variant="data.item.status === 'success' ? 'success' : 'danger'">
                            {{ data.item.status }}
                        </b-badge>
                    </template>
                    
                    <template #cell(deployedAt)="data">
                        {{ formatDate(data.item.deployedAt) }}
                    </template>
                    
                    <template #cell(actions)="data">
                        <b-button 
                            variant="outline-primary" 
                            size="sm"
                            @click="rollbackToDeployment(data.item)"
                            :disabled="data.item.status !== 'success'"
                        >
                            <font-awesome-icon icon="arrows-rotate" /> {{ $t("Rollback") }}
                        </b-button>
                    </template>
                </b-table>
            </div>
        </b-modal>
    </div>
</template>

<script>
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import { socket } from "../../mixins/socket";

export default {
    components: {
        FontAwesomeIcon
    },
    data() {
        return {
            repositories: [],
            loading: true,
            errorMsg: null,
            
            // Repository form
            showForm: false,
            editMode: false,
            form: this.getDefaultForm(),
            formLoading: false,
            
            // Credential form
            showCredForm: false,
            credForm: this.getDefaultCredForm(),
            credFormLoading: false,
            credentials: [],
            
            // Agents
            agents: [],
            
            // Delete modal
            showDelete: false,
            deleteLoading: false,
            selectedRepository: null,
            
            // Deploy modal
            showDeploy: false,
            deployLoading: false,
            deployLoadingMsg: "",
            deployErrorMsg: null,
            composeFiles: [],
            deployForm: this.getDefaultDeployForm(),
            deployFormSubmitting: false,
            
            // Deployments history
            showHistory: false,
            deploymentsLoading: false,
            deployments: [],
            deploymentFields: [
                { key: 'stackName', label: this.$t('Stack') },
                { key: 'commitHash', label: this.$t('Commit') },
                { key: 'message', label: this.$t('Message') },
                { key: 'status', label: this.$t('Status') },
                { key: 'deployedAt', label: this.$t('Deployed At') },
                { key: 'actions', label: this.$t('Actions') }
            ],
            
            // Progress tracking
            progresses: {
                "add-repository": null,
                "scan-repository": null,
                "sync-repository": null,
                "deploy-repository": null,
                "rollback-deployment": null
            }
        };
    },
    mounted() {
        this.loadRepositories();
        this.loadCredentials();
        this.loadAgents();
        this.registerProgressHandlers();
    },
    methods: {
        getDefaultForm() {
            return {
                id: null,
                name: "",
                url: "",
                branch: "main",
                agentId: null,
                path: "",
                authType: "none",
                authCredentialId: null,
                syncInterval: 0
            };
        },
        getDefaultCredForm() {
            return {
                name: "",
                type: "ssh",
                data: ""
            };
        },
        getDefaultDeployForm() {
            return {
                filePath: "",
                stackName: "",
                variables: [],
                force: false
            };
        },
        registerProgressHandlers() {
            // Register handlers for progress events
            Object.keys(this.progresses).forEach(operation => {
                socket.on(`git:${operation}:progress`, (progress) => {
                    this.progresses[operation] = progress;
                    this.handleProgress(operation, progress);
                });
            });
        },
        handleProgress(operation, progress) {
            // Handle specific progress updates
            if (operation === "scan-repository") {
                this.deployLoadingMsg = progress.message;
            }
        },
        loadRepositories() {
            this.loading = true;
            socket.emit("getRepositoryList", (res) => {
                this.loading = false;
                if (res.ok) {
                    this.repositories = res.repositories;
                } else {
                    this.errorMsg = res.error || "Failed to load repositories";
                }
            });
        },
        loadCredentials() {
            socket.emit("getCredentialList", (res) => {
                if (res.ok) {
                    this.credentials = res.credentials;
                }
            });
        },
        loadAgents() {
            socket.emit("getAgentList", (res) => {
                if (res && res.list) {
                    this.agents = Object.values(res.list);
                }
            });
        },
        getAgentName(agentId) {
            const agent = this.agents.find(a => a.id === agentId);
            return agent ? agent.endpoint : agentId;
        },
        showAddForm() {
            this.editMode = false;
            this.form = this.getDefaultForm();
            this.showForm = true;
        },
        showAddCredential() {
            this.credForm = this.getDefaultCredForm();
            this.showCredForm = true;
        },
        async saveCredential() {
            this.credFormLoading = true;
            socket.emit("addCredential", this.credForm, (res) => {
                this.credFormLoading = false;
                if (res.ok) {
                    this.showCredForm = false;
                    this.loadCredentials();
                    // Select the newly created credential
                    this.form.authCredentialId = res.id;
                } else {
                    this.errorMsg = res.error || "Failed to create credential";
                }
            });
        },
        editRepository(repo) {
            this.editMode = true;
            this.form = {
                id: repo.id,
                name: repo.name,
                url: repo.url,
                branch: repo.branch,
                agentId: repo.agentId,
                path: repo.path,
                authType: repo.authType,
                authCredentialId: repo.authCredentialId,
                syncInterval: repo.syncInterval
            };
            this.showForm = true;
        },
        saveRepository() {
            this.formLoading = true;
            if (this.editMode) {
                socket.emit("updateRepository", this.form, (res) => {
                    this.formLoading = false;
                    if (res.ok) {
                        this.showForm = false;
                        this.loadRepositories();
                    } else {
                        this.errorMsg = res.error || "Failed to update repository";
                    }
                });
            } else {
                socket.emit("addRepository", this.form, (res) => {
                    this.formLoading = false;
                    if (res.ok) {
                        this.showForm = false;
                        this.loadRepositories();
                    } else {
                        this.errorMsg = res.error || "Failed to add repository";
                    }
                });
            }
        },
        confirmDelete(repo) {
            this.selectedRepository = repo;
            this.showDelete = true;
        },
        deleteRepository() {
            if (!this.selectedRepository) return;
            
            this.deleteLoading = true;
            socket.emit("deleteRepository", this.selectedRepository.id, (res) => {
                this.deleteLoading = false;
                if (res.ok) {
                    this.showDelete = false;
                    this.loadRepositories();
                } else {
                    this.errorMsg = res.error || "Failed to delete repository";
                }
            });
        },
        syncRepository(repo) {
            socket.emit("syncRepository", repo.id, (res) => {
                if (!res.ok) {
                    this.errorMsg = res.error || "Failed to sync repository";
                } else {
                    this.$bvToast.toast(res.message, {
                        title: "Repository Synced",
                        variant: "success",
                        solid: true
                    });
                    // Reload repositories to get updated sync status
                    this.loadRepositories();
                }
            });
        },
        showDeployForm(repo) {
            this.selectedRepository = repo;
            this.showDeploy = true;
            this.deployLoading = true;
            this.deployLoadingMsg = this.$t("Scanning repository for compose files...");
            this.scanRepository(repo);
        },
        scanRepository(repo) {
            this.deployLoading = true;
            this.deployLoadingMsg = this.$t("Scanning repository for compose files...");
            this.composeFiles = [];
            
            socket.emit("scanRepository", repo.id, (res) => {
                this.deployLoading = false;
                if (res.ok) {
                    this.composeFiles = res.files;
                    if (this.composeFiles.length > 0) {
                        this.deployForm.filePath = this.composeFiles[0].path;
                    }
                } else {
                    this.deployErrorMsg = res.error || "Failed to scan repository";
                }
            });
        },
        addVariable() {
            this.deployForm.variables.push({ key: "", value: "" });
        },
        removeVariable(index) {
            this.deployForm.variables.splice(index, 1);
        },
        deployRepository() {
            if (!this.selectedRepository) return;
            
            // Convert variables array to object
            const variables = {};
            this.deployForm.variables.forEach(v => {
                if (v.key) {
                    variables[v.key] = v.value;
                }
            });
            
            const deployData = {
                repositoryId: this.selectedRepository.id,
                filePath: this.deployForm.filePath,
                stackName: this.deployForm.stackName,
                variables,
                force: this.deployForm.force
            };
            
            this.deployFormSubmitting = true;
            socket.emit("deployFromRepository", deployData, (res) => {
                this.deployFormSubmitting = false;
                if (res.ok) {
                    this.showDeploy = false;
                    this.$bvToast.toast(res.message, {
                        title: "Deployment Successful",
                        variant: "success",
                        solid: true
                    });
                } else {
                    this.deployErrorMsg = res.error || "Failed to deploy";
                }
            });
        },
        showDeployments(repo) {
            this.selectedRepository = repo;
            this.showHistory = true;
            this.loadDeployments(repo.id);
        },
        loadDeployments(repositoryId) {
            this.deploymentsLoading = true;
            socket.emit("getDeployments", repositoryId, (res) => {
                this.deploymentsLoading = false;
                if (res.ok) {
                    this.deployments = res.deployments;
                } else {
                    this.errorMsg = res.error || "Failed to load deployments";
                }
            });
        },
        rollbackToDeployment(deployment) {
            if (confirm(this.$t("Are you sure you want to rollback to this deployment?"))) {
                socket.emit("rollbackDeployment", deployment.id, (res) => {
                    if (res.ok) {
                        this.$bvToast.toast(res.message, {
                            title: "Rollback Successful",
                            variant: "success",
                            solid: true
                        });
                        this.showHistory = false;
                    } else {
                        this.errorMsg = res.error || "Failed to rollback";
                    }
                });
            }
        },
        formatDate(dateStr) {
            if (!dateStr) return "";
            const date = new Date(dateStr);
            return date.toLocaleString();
        },
        resetForm() {
            this.form = this.getDefaultForm();
            this.editMode = false;
        },
        resetCredForm() {
            this.credForm = this.getDefaultCredForm();
        },
        resetDeployForm() {
            this.deployForm = this.getDefaultDeployForm();
            this.selectedRepository = null;
            this.composeFiles = [];
            this.deployErrorMsg = null;
        }
    }
};
</script>

<style scoped>
.repo-list {
    max-height: 600px;
    overflow-y: auto;
}
</style>