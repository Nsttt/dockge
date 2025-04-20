<template>
    <div>
        <div class="d-flex justify-content-between align-items-center mb-3">
            <h2>{{ $t("Git Credentials") }}</h2>
            <div>
                <b-button variant="primary" @click="showAddForm">
                    <font-awesome-icon icon="plus" /> {{ $t("Add Credential") }}
                </b-button>
            </div>
        </div>

        <b-alert :show="errorMsg !== null" variant="danger" dismissible @dismissed="errorMsg = null">
            {{ errorMsg }}
        </b-alert>

        <b-card v-if="loading" body-class="text-center py-4">
            <font-awesome-icon icon="spinner" spin size="2x" class="text-primary" />
            <p class="mt-3 text-muted">{{ $t("Loading credentials...") }}</p>
        </b-card>

        <div v-else-if="credentials.length === 0" class="text-center p-5 bg-light rounded">
            <div class="mb-3">
                <font-awesome-icon icon="key" class="text-muted" style="width: 3rem; height: 3rem;" />
            </div>
            <h4 class="text-muted">{{ $t("No Git credentials found") }}</h4>
            <p class="text-muted">{{ $t("Add credentials to authenticate with private Git repositories") }}</p>
            <b-button variant="primary" @click="showAddForm">
                <font-awesome-icon icon="plus" /> {{ $t("Add Credential") }}
            </b-button>
        </div>

        <div v-else>
            <b-table striped hover :items="credentials" :fields="fields">
                <template #cell(type)="data">
                    <b-badge variant="info">
                        <font-awesome-icon icon="key" v-if="data.item.type === 'ssh'" /> {{ formatType(data.item.type) }}
                    </b-badge>
                </template>
                
                <template #cell(actions)="data">
                    <b-button-group size="sm">
                        <b-button variant="outline-secondary" @click="editCredential(data.item)">
                            <font-awesome-icon icon="pen" />
                        </b-button>
                        <b-button variant="outline-danger" @click="confirmDelete(data.item)">
                            <font-awesome-icon icon="trash" />
                        </b-button>
                    </b-button-group>
                </template>
            </b-table>
        </div>

        <!-- Credential Form Modal -->
        <b-modal
            v-model="showForm"
            :title="editMode ? $t('Edit Credential') : $t('Add Credential')"
            @hidden="resetForm"
            hide-footer
        >
            <b-form @submit.prevent="saveCredential">
                <b-form-group :label="$t('Credential Name')">
                    <b-form-input v-model="form.name" required />
                </b-form-group>

                <b-form-group :label="$t('Credential Type')">
                    <b-form-select v-model="form.type" required>
                        <option value="ssh">{{ $t("SSH Key") }}</option>
                        <option value="token">{{ $t("Access Token") }}</option>
                    </b-form-select>
                </b-form-group>

                <b-form-group :label="form.type === 'ssh' ? $t('SSH Private Key') : $t('Access Token')">
                    <b-form-textarea 
                        v-if="form.type === 'ssh'" 
                        v-model="form.data" 
                        rows="10"
                        placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                    />
                    <b-form-input 
                        v-else 
                        v-model="form.data" 
                        placeholder="ghp_1234567890abcdef"
                    />
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

        <!-- Delete Confirmation Modal -->
        <b-modal
            v-model="showDelete"
            :title="$t('Delete Credential')"
            @hidden="selectedCredential = null"
            hide-footer
        >
            <p>{{ $t("Are you sure you want to delete this credential?") }}</p>
            <p class="font-weight-bold" v-if="selectedCredential">{{ selectedCredential.name }}</p>
            <p class="text-danger">{{ $t("This may affect repositories using this credential.") }}</p>
            
            <div class="d-flex justify-content-end mt-3">
                <b-button variant="secondary" class="mr-2" @click="showDelete = false">
                    {{ $t("Cancel") }}
                </b-button>
                <b-button variant="danger" @click="deleteCredential" :disabled="deleteLoading">
                    <font-awesome-icon v-if="deleteLoading" icon="spinner" spin />
                    {{ $t("Delete") }}
                </b-button>
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
            credentials: [],
            loading: true,
            errorMsg: null,
            fields: [
                { key: 'name', label: this.$t('Name') },
                { key: 'type', label: this.$t('Type') },
                { key: 'actions', label: this.$t('Actions') }
            ],
            
            // Form
            showForm: false,
            editMode: false,
            form: this.getDefaultForm(),
            formLoading: false,
            
            // Delete modal
            showDelete: false,
            deleteLoading: false,
            selectedCredential: null
        };
    },
    mounted() {
        this.loadCredentials();
    },
    methods: {
        getDefaultForm() {
            return {
                id: null,
                name: "",
                type: "ssh",
                data: ""
            };
        },
        loadCredentials() {
            this.loading = true;
            socket.emit("getCredentialList", (res) => {
                this.loading = false;
                if (res.ok) {
                    this.credentials = res.credentials;
                } else {
                    this.errorMsg = res.error || "Failed to load credentials";
                }
            });
        },
        formatType(type) {
            if (type === 'ssh') return 'SSH Key';
            if (type === 'token') return 'Access Token';
            return type;
        },
        showAddForm() {
            this.editMode = false;
            this.form = this.getDefaultForm();
            this.showForm = true;
        },
        editCredential(credential) {
            this.editMode = true;
            this.form = {
                id: credential.id,
                name: credential.name,
                type: credential.type,
                data: "" // We don't show stored data for security
            };
            this.showForm = true;
        },
        saveCredential() {
            this.formLoading = true;
            
            // Don't send empty data when editing to avoid overwriting
            if (this.editMode && !this.form.data) {
                const { data, ...formWithoutData } = this.form;
                
                socket.emit("updateCredential", formWithoutData, (res) => {
                    this.formLoading = false;
                    if (res.ok) {
                        this.showForm = false;
                        this.loadCredentials();
                    } else {
                        this.errorMsg = res.error || "Failed to update credential";
                    }
                });
            } else {
                const method = this.editMode ? "updateCredential" : "addCredential";
                
                socket.emit(method, this.form, (res) => {
                    this.formLoading = false;
                    if (res.ok) {
                        this.showForm = false;
                        this.loadCredentials();
                    } else {
                        this.errorMsg = res.error || "Failed to save credential";
                    }
                });
            }
        },
        confirmDelete(credential) {
            this.selectedCredential = credential;
            this.showDelete = true;
        },
        deleteCredential() {
            if (!this.selectedCredential) return;
            
            this.deleteLoading = true;
            socket.emit("deleteCredential", this.selectedCredential.id, (res) => {
                this.deleteLoading = false;
                if (res.ok) {
                    this.showDelete = false;
                    this.loadCredentials();
                } else {
                    this.errorMsg = res.error || "Failed to delete credential";
                    this.showDelete = false;
                }
            });
        },
        resetForm() {
            this.form = this.getDefaultForm();
            this.editMode = false;
        }
    }
};
</script>