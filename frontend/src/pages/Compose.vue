<template>
    <transition name="slide-fade" appear>
        <div>
            <h1 v-if="isAdd" class="mb-3 d-flex align-items-center">
                {{ $t("compose") }}
                <div class="btn-group mode-toggle ms-3" role="group">
                    <button
                        :class="[
                            'btn btn-sm',
                            !isGitOpsMode
                                ? 'btn-primary'
                                : 'btn-outline-primary',
                        ]"
                        @click="switchToDirectMode"
                    >
                        <font-awesome-icon icon="pen" class="me-1" />
                        {{ $t("Direct Edit") }}
                    </button>
                    <button
                        :class="[
                            'btn btn-sm',
                            isGitOpsMode
                                ? 'btn-primary'
                                : 'btn-outline-primary',
                        ]"
                        @click="switchToGitOpsMode"
                    >
                        <font-awesome-icon icon="code-branch" class="me-1" />
                        {{ $t("GitOps") }}
                    </button>
                </div>
            </h1>
            <h1 v-else class="mb-3 d-flex align-items-center">
                <Uptime :stack="globalStack" :pill="true" /> {{ stack.name }}
                <span v-if="$root.agentCount > 1" class="agent-name">
                    ({{ endpointDisplay }})
                </span>
                <div class="btn-group mode-toggle ms-3" role="group">
                    <button
                        :class="[
                            'btn btn-sm',
                            !isGitOpsMode
                                ? 'btn-primary'
                                : 'btn-outline-primary',
                        ]"
                        @click="switchToDirectMode"
                    >
                        <font-awesome-icon icon="pen" class="me-1" />
                        {{ $t("Direct Edit") }}
                    </button>
                    <button
                        :class="[
                            'btn btn-sm',
                            isGitOpsMode
                                ? 'btn-primary'
                                : 'btn-outline-primary',
                        ]"
                        @click="switchToGitOpsMode"
                    >
                        <font-awesome-icon icon="code-branch" class="me-1" />
                        {{ $t("GitOps") }}
                    </button>
                </div>
            </h1>

            <div v-if="stack.isManagedByDockge" class="mb-3">
                <div class="btn-group me-2" role="group">
                    <button
                        v-if="isEditMode"
                        class="btn btn-primary"
                        :disabled="processing"
                        @click="deployStack"
                    >
                        <font-awesome-icon icon="rocket" class="me-1" />
                        {{ $t("deployStack") }}
                    </button>

                    <button
                        v-if="isEditMode"
                        class="btn btn-normal"
                        :disabled="processing"
                        @click="saveStack"
                    >
                        <font-awesome-icon icon="save" class="me-1" />
                        {{ $t("saveStackDraft") }}
                    </button>

                    <button
                        v-if="!isEditMode"
                        class="btn btn-secondary"
                        :disabled="processing"
                        @click="enableEditMode"
                    >
                        <font-awesome-icon icon="pen" class="me-1" />
                        {{ $t("editStack") }}
                    </button>

                    <button
                        v-if="!isEditMode && !active"
                        class="btn btn-primary"
                        :disabled="processing"
                        @click="startStack"
                    >
                        <font-awesome-icon icon="play" class="me-1" />
                        {{ $t("startStack") }}
                    </button>

                    <button
                        v-if="!isEditMode && active"
                        class="btn btn-normal"
                        :disabled="processing"
                        @click="restartStack"
                    >
                        <font-awesome-icon icon="rotate" class="me-1" />
                        {{ $t("restartStack") }}
                    </button>

                    <button
                        v-if="!isEditMode"
                        class="btn btn-normal"
                        :disabled="processing"
                        @click="updateStack"
                    >
                        <font-awesome-icon
                            icon="cloud-arrow-down"
                            class="me-1"
                        />
                        {{ $t("updateStack") }}
                    </button>

                    <button
                        v-if="!isEditMode && active"
                        class="btn btn-normal"
                        :disabled="processing"
                        @click="stopStack"
                    >
                        <font-awesome-icon icon="stop" class="me-1" />
                        {{ $t("stopStack") }}
                    </button>

                    <BDropdown right text="" variant="normal">
                        <BDropdownItem @click="downStack">
                            <font-awesome-icon icon="stop" class="me-1" />
                            {{ $t("downStack") }}
                        </BDropdownItem>
                    </BDropdown>
                </div>

                <button
                    v-if="isEditMode && !isAdd"
                    class="btn btn-normal"
                    :disabled="processing"
                    @click="discardStack"
                >
                    {{ $t("discardStack") }}
                </button>
                <button
                    v-if="!isEditMode"
                    class="btn btn-danger"
                    :disabled="processing"
                    @click="showDeleteDialog = !showDeleteDialog"
                >
                    <font-awesome-icon icon="trash" class="me-1" />
                    {{ $t("deleteStack") }}
                </button>
            </div>

            <!-- URLs -->
            <div v-if="urls.length > 0" class="mb-3">
                <a
                    v-for="(url, index) in urls"
                    :key="index"
                    target="_blank"
                    :href="url.url"
                >
                    <span class="badge bg-secondary me-2">{{
                        url.display
                    }}</span>
                </a>
            </div>

            <!-- Progress Terminal -->
            <transition name="slide-fade" appear>
                <Terminal
                    v-show="showProgressTerminal"
                    ref="progressTerminal"
                    class="mb-3 terminal"
                    :name="terminalName"
                    :endpoint="endpoint"
                    :rows="progressTerminalRows"
                    @has-data="
                        showProgressTerminal = true;
                        submitted = true;
                    "
                ></Terminal>
            </transition>

            <div v-if="stack.isManagedByDockge" class="row">
                <div class="col-lg-6">
                    <!-- General -->
                    <div v-if="isAdd">
                        <h4 class="mb-3">{{ $t("general") }}</h4>
                        <div class="shadow-box big-padding mb-3">
                            <!-- Stack Name -->
                            <div>
                                <label for="name" class="form-label">{{
                                    $t("stackName")
                                }}</label>
                                <input
                                    id="name"
                                    v-model="stack.name"
                                    type="text"
                                    class="form-control"
                                    required
                                    @blur="stackNameToLowercase"
                                />
                                <div class="form-text">
                                    {{ $t("Lowercase only") }}
                                </div>
                            </div>

                            <!-- Endpoint -->
                            <div class="mt-3">
                                <label for="name" class="form-label">{{
                                    $t("dockgeAgent")
                                }}</label>
                                <select
                                    v-model="stack.endpoint"
                                    class="form-select"
                                >
                                    <option
                                        v-for="(
                                            agent, endpoint
                                        ) in $root.agentList"
                                        :key="endpoint"
                                        :value="endpoint"
                                        :disabled="
                                            $root.agentStatusList[endpoint] !=
                                                'online'
                                        "
                                    >
                                        ({{ $root.agentStatusList[endpoint] }})
                                        {{
                                            endpoint
                                                ? endpoint
                                                : $t("currentEndpoint")
                                        }}
                                    </option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <!-- Direct Edit Mode Sections -->
                    <div v-if="!isGitOpsMode">
                        <!-- Containers -->
                        <h4 class="mb-3">{{ $tc("container", 2) }}</h4>

                        <div v-if="isEditMode" class="input-group mb-3">
                            <input
                                v-model="newContainerName"
                                :placeholder="$t(`New Container Name...`)"
                                class="form-control"
                                @keyup.enter="addContainer"
                            />
                            <button
                                class="btn btn-primary"
                                @click="addContainer"
                            >
                                {{ $t("addContainer") }}
                            </button>
                        </div>

                        <div ref="containerList">
                            <Container
                                v-for="(service, name) in jsonConfig.services"
                                :key="name"
                                :name="name"
                                :is-edit-mode="isEditMode"
                                :first="
                                    name === Object.keys(jsonConfig.services)[0]
                                "
                                :status="serviceStatusList[name]"
                            />
                        </div>

                        <!-- General -->
                        <div v-if="isEditMode">
                            <h4 class="mb-3">{{ $t("extra") }}</h4>
                            <div class="shadow-box big-padding mb-3">
                                <!-- URLs -->
                                <div class="mb-4">
                                    <label class="form-label">
                                        {{ $tc("url", 2) }}
                                    </label>
                                    <ArrayInput
                                        name="urls"
                                        :display-name="$t('url')"
                                        placeholder="https://"
                                        object-type="x-dockge"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- GitOps Mode Services Display -->
                    <div v-else>
                        <h4 class="mb-3">{{ $tc("container", 2) }}</h4>
                        <div class="shadow-box big-padding mb-3">
                            <div
                                v-if="
                                    jsonConfig.services &&
                                        Object.keys(jsonConfig.services).length > 0
                                "
                            >
                                <div
                                    v-for="(
                                        service, name
                                    ) in jsonConfig.services"
                                    :key="name"
                                    class="mb-2 p-2 border-bottom"
                                >
                                    <div class="d-flex align-items-center">
                                        <strong>{{ name }}</strong>
                                        <span class="ms-2 text-muted">{{
                                            service.image
                                        }}</span>
                                    </div>
                                </div>
                            </div>
                            <div v-else class="text-center text-muted p-3">
                                {{
                                    $t("No services found in this compose file")
                                }}
                            </div>
                        </div>

                        <!-- Environment Variables for GitOps Mode -->
                        <h4 class="mb-3">.env</h4>
                        <div
                            class="shadow-box mb-3 editor-box"
                            :class="{ 'edit-mode': isEditMode }"
                        >
                            <prism-editor
                                ref="gitEnvEditor"
                                v-model="gitEnvContent"
                                class="env-editor"
                                :highlight="highlighterENV"
                                line-numbers
                                :readonly="!isEditMode"
                                @input="gitEnvChange"
                                @focus="editorFocus = true"
                                @blur="editorFocus = false"
                            ></prism-editor>
                        </div>
                        <div v-if="isEditMode" class="mb-3 text-muted small">
                            <font-awesome-icon
                                icon="info-circle"
                                class="me-2"
                            />
                            {{
                                $t(
                                    "These variables will be injected when deploying from Git. You can reference them in your compose file using ${VARIABLE} syntax."
                                )
                            }}
                        </div>
                    </div>

                    <!-- Combined Terminal Output -->
                    <div v-show="!isEditMode">
                        <h4 class="mb-3">{{ $t("terminal") }}</h4>
                        <Terminal
                            ref="combinedTerminal"
                            class="mb-3 terminal"
                            :name="combinedTerminalName"
                            :endpoint="endpoint"
                            :rows="combinedTerminalRows"
                            :cols="combinedTerminalCols"
                            style="height: 315px"
                        ></Terminal>
                    </div>
                </div>
                <div class="col-lg-6">
                    <h4 class="mb-3">{{ stack.composeFileName }}</h4>

                    <!-- GitOps Repository Selector -->
                    <div
                        v-if="isGitOpsMode"
                        class="shadow-box big-padding mb-3"
                    >
                        <h5 class="mb-3">{{ $t("Git Repository") }}</h5>

                        <div
                            v-if="repositories.length === 0"
                            class="shadow-box big-padding mb-3"
                        >
                            <p class="text-center mb-3">
                                {{ $t("No Git repositories found") }}
                            </p>
                            <div class="text-center">
                                <button
                                    class="btn btn-primary"
                                    @click="showAddRepositoryModal"
                                >
                                    <font-awesome-icon
                                        icon="plus"
                                        class="me-1"
                                    />
                                    {{ $t("Add Repository") }}
                                </button>
                            </div>
                        </div>

                        <div v-else>
                            <div class="d-flex mb-3">
                                <div class="flex-grow-1">
                                    <label class="form-label">{{
                                        $t("Repository")
                                    }}</label>
                                    <select
                                        v-model="stack.repositoryId"
                                        class="form-select"
                                        @change="onRepositoryChange"
                                    >
                                        <option
                                            v-for="repo in repositories"
                                            :key="repo.id"
                                            :value="repo.id"
                                        >
                                            {{ repo.name }}
                                        </option>
                                    </select>
                                </div>
                                <div class="ms-2 d-flex align-items-end">
                                    <button
                                        class="btn btn-outline-primary mb-1"
                                        @click="showAddRepositoryModal"
                                    >
                                        <font-awesome-icon icon="plus" />
                                    </button>
                                </div>
                            </div>

                            <div class="mb-3">
                                <label class="form-label">{{
                                    $t("Branch")
                                }}</label>
                                <select
                                    v-model="stack.gitBranch"
                                    class="form-select"
                                    @change="onBranchChange"
                                >
                                    <option
                                        v-for="branch in branches"
                                        :key="branch"
                                        :value="branch"
                                    >
                                        {{ branch }}
                                    </option>
                                </select>
                            </div>

                            <div class="mb-3">
                                <label class="form-label">{{
                                    $t("Compose File")
                                }}</label>
                                <select
                                    v-model="stack.filePath"
                                    class="form-select"
                                    @change="loadFileContent"
                                >
                                    <option
                                        v-for="file in composeFiles"
                                        :key="file.path"
                                        :value="file.path"
                                    >
                                        {{ file.path }}
                                    </option>
                                </select>
                            </div>

                            <!-- Agent Selection for deployment target -->
                            <div class="mb-3">
                                <label class="form-label">{{
                                    $t("Deployment Target")
                                }}</label>
                                <select
                                    v-model="stack.endpoint"
                                    class="form-select"
                                >
                                    <option
                                        v-for="(
                                            agent, endpoint
                                        ) in $root.agentList"
                                        :key="endpoint"
                                        :value="endpoint"
                                        :disabled="
                                            $root.agentStatusList[endpoint] !=
                                                'online'
                                        "
                                    >
                                        {{
                                            $root.agentStatusList[endpoint] ===
                                                "online"
                                                ? "✅"
                                                : "❌"
                                        }}
                                        {{
                                            endpoint
                                                ? endpoint
                                                : $t("currentEndpoint")
                                        }}
                                    </option>
                                </select>
                                <div class="form-text">
                                    {{
                                        $t(
                                            "Select which agent should deploy this stack"
                                        )
                                    }}
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Show YAML preview in GitOps mode -->
                    <div v-if="isGitOpsMode && previewYAML">
                        <h4 class="mb-3">
                            {{ stack.filePath || "compose.yaml" }}
                        </h4>
                        <div class="shadow-box mb-3 editor-box">
                            <prism-editor
                                v-model="previewYAML"
                                class="yaml-editor"
                                :highlight="highlighterYAML"
                                line-numbers
                                readonly
                            ></prism-editor>
                        </div>
                    </div>

                    <!-- YAML editor (Direct Edit Mode) -->
                    <div
                        v-if="!isGitOpsMode"
                        class="shadow-box mb-3 editor-box"
                        :class="{ 'edit-mode': isEditMode }"
                    >
                        <prism-editor
                            ref="editor"
                            v-model="stack.composeYAML"
                            class="yaml-editor"
                            :highlight="highlighterYAML"
                            line-numbers
                            :readonly="!isEditMode"
                            @input="yamlCodeChange"
                            @focus="editorFocus = true"
                            @blur="editorFocus = false"
                        ></prism-editor>
                    </div>
                    <div v-if="isEditMode && !isGitOpsMode" class="mb-3">
                        {{ yamlError }}
                    </div>

                    <!-- ENV editor (Direct Edit Mode) -->
                    <div v-if="isEditMode && !isGitOpsMode">
                        <h4 class="mb-3">.env</h4>
                        <div
                            class="shadow-box mb-3 editor-box"
                            :class="{ 'edit-mode': isEditMode }"
                        >
                            <prism-editor
                                ref="editor"
                                v-model="stack.composeENV"
                                class="env-editor"
                                :highlight="highlighterENV"
                                line-numbers
                                :readonly="!isEditMode"
                                @focus="editorFocus = true"
                                @blur="editorFocus = false"
                            ></prism-editor>
                        </div>
                    </div>

                    <div v-if="isEditMode && !isGitOpsMode">
                        <!-- Volumes -->
                        <div v-if="false">
                            <h4 class="mb-3">{{ $tc("volume", 2) }}</h4>
                            <div class="shadow-box big-padding mb-3"></div>
                        </div>

                        <!-- Networks -->
                        <h4 class="mb-3">{{ $tc("network", 2) }}</h4>
                        <div class="shadow-box big-padding mb-3">
                            <NetworkInput />
                        </div>
                    </div>

                    <!-- <div class="shadow-box big-padding mb-3">
                        <div class="mb-3">
                            <label for="name" class="form-label"> Search Templates</label>
                            <input id="name" v-model="name" type="text" class="form-control" placeholder="Search..." required>
                        </div>

                        <prism-editor v-if="false" v-model="yamlConfig" class="yaml-editor" :highlight="highlighter" line-numbers @input="yamlCodeChange"></prism-editor>
                    </div>-->
                </div>
            </div>

            <div v-if="!stack.isManagedByDockge && !processing">
                {{ $t("stackNotManagedByDockgeMsg") }}
            </div>

            <!-- Delete Dialog -->
            <BModal
                v-model="showDeleteDialog"
                :cancelTitle="$t('cancel')"
                :okTitle="$t('deleteStack')"
                okVariant="danger"
                @ok="deleteDialog"
            >
                {{ $t("deleteStackMsg") }}
            </BModal>

            <!-- Repository Add Modal -->
            <BModal
                v-model="showRepoModal"
                :title="$t('Add Git Repository')"
                @hidden="resetRepoForm"
                hide-footer
                size="lg"
            >
                <div v-if="repoFormError" class="alert alert-danger">
                    {{ repoFormError }}
                </div>

                <form @submit.prevent="saveRepository">
                    <div class="mb-3">
                        <label class="form-label">{{
                            $t("Repository Name")
                        }}</label>
                        <input
                            v-model="repoForm.name"
                            type="text"
                            class="form-control"
                            required
                        />
                    </div>

                    <div class="mb-3">
                        <label class="form-label">{{
                            $t("Repository URL")
                        }}</label>
                        <input
                            v-model="repoForm.url"
                            type="text"
                            class="form-control"
                            required
                            placeholder="https://github.com/username/repo.git"
                        />
                        <div class="form-text">
                            {{ $t("SSH or HTTPS URL to the Git repository") }}
                        </div>
                    </div>

                    <div class="mb-3">
                        <label class="form-label">{{ $t("Branch") }}</label>
                        <input
                            v-model="repoForm.branch"
                            type="text"
                            class="form-control"
                            placeholder="main"
                        />
                    </div>

                    <div class="mb-3">
                        <label class="form-label">{{
                            $t("Automatic Sync")
                        }}</label>
                        <select
                            v-model="repoForm.syncIntervalType"
                            class="form-select"
                            @change="updateSyncInterval"
                        >
                            <option value="disabled">
                                {{ $t("Disabled (Manual Sync Only)") }}
                            </option>
                            <option value="minutes">
                                {{ $t("Every X Minutes") }}
                            </option>
                            <option value="hours">
                                {{ $t("Every X Hours") }}
                            </option>
                            <option value="days">{{ $t("Daily") }}</option>
                        </select>
                    </div>

                    <div
                        v-if="repoForm.syncIntervalType !== 'disabled'"
                        class="mb-3"
                    >
                        <div
                            v-if="
                                repoForm.syncIntervalType === 'minutes' ||
                                    repoForm.syncIntervalType === 'hours'
                            "
                        >
                            <label class="form-label">{{
                                repoForm.syncIntervalType === "minutes"
                                    ? $t("Interval (Minutes)")
                                    : $t("Interval (Hours)")
                            }}</label>
                            <input
                                v-model.number="repoForm.syncIntervalValue"
                                type="number"
                                class="form-control"
                                :min="
                                    repoForm.syncIntervalType === 'minutes'
                                        ? 5
                                        : 1
                                "
                                :max="
                                    repoForm.syncIntervalType === 'minutes'
                                        ? 1440
                                        : 24
                                "
                            />
                            <div
                                class="form-text"
                                v-if="repoForm.syncIntervalType === 'minutes'"
                            >
                                {{
                                    $t(
                                        "Minimum 5 minutes, maximum 1440 minutes (24 hours)"
                                    )
                                }}
                            </div>
                            <div class="form-text" v-else>
                                {{ $t("Minimum 1 hour, maximum 24 hours") }}
                            </div>
                        </div>

                        <div
                            v-if="repoForm.syncIntervalType === 'days'"
                            class="text-muted"
                        >
                            {{
                                $t(
                                    "Repository will be synced once every 24 hours"
                                )
                            }}
                        </div>
                    </div>

                    <div class="mb-3">
                        <label class="form-label">{{ $t("Agent") }}</label>
                        <select v-model="repoForm.agentId" class="form-select">
                            <option :value="null">
                                {{ $t("All Agents (Global)") }}
                            </option>
                            <option
                                v-for="agent in agents"
                                :key="agent.id"
                                :value="agent.id"
                            >
                                {{ agent.endpoint }}
                            </option>
                        </select>
                        <div class="form-text">
                            {{
                                $t(
                                    'Repository will be available to all agents if set to "All Agents"'
                                )
                            }}
                        </div>
                    </div>

                    <div class="mb-3">
                        <label class="form-label">{{
                            $t("Authentication")
                        }}</label>
                        <select v-model="repoForm.authType" class="form-select">
                            <option value="none">{{ $t("None") }}</option>
                            <option value="ssh">{{ $t("SSH Key") }}</option>
                            <option value="token">
                                {{ $t("Access Token") }}
                            </option>
                        </select>
                    </div>

                    <div v-if="repoForm.authType !== 'none'" class="mb-3">
                        <label class="form-label">{{ $t("Credential") }}</label>
                        <div class="d-flex">
                            <select
                                v-model="repoForm.authCredentialId"
                                class="form-select flex-grow-1 me-2"
                            >
                                <option
                                    v-for="cred in credentials"
                                    :key="cred.id"
                                    :value="cred.id"
                                >
                                    {{ cred.name }}
                                </option>
                            </select>
                            <button
                                type="button"
                                class="btn btn-outline-primary"
                                @click="showAddCredential"
                            >
                                <font-awesome-icon icon="plus" />
                            </button>
                        </div>
                    </div>

                    <div class="d-flex justify-content-end mt-4">
                        <button
                            type="button"
                            class="btn btn-secondary me-2"
                            @click="showRepoModal = false"
                        >
                            {{ $t("Cancel") }}
                        </button>
                        <button
                            type="submit"
                            class="btn btn-primary"
                            :disabled="repoFormLoading"
                        >
                            <font-awesome-icon
                                v-if="repoFormLoading"
                                icon="spinner"
                                spin
                                class="me-1"
                            />
                            {{ $t("Add") }}
                        </button>
                    </div>
                </form>
            </BModal>

            <!-- Credential Add Modal -->
            <BModal
                v-model="showCredModal"
                :title="$t('Add Credential')"
                @hidden="resetCredForm"
                hide-footer
            >
                <div v-if="credFormError" class="alert alert-danger">
                    {{ credFormError }}
                </div>

                <form @submit.prevent="saveCredential">
                    <div class="mb-3">
                        <label class="form-label">{{
                            $t("Credential Name")
                        }}</label>
                        <input
                            v-model="credForm.name"
                            type="text"
                            class="form-control"
                            required
                        />
                    </div>

                    <div class="mb-3">
                        <label class="form-label">{{
                            $t("Credential Type")
                        }}</label>
                        <select
                            v-model="credForm.type"
                            class="form-select"
                            required
                        >
                            <option value="ssh">{{ $t("SSH Key") }}</option>
                            <option value="token">
                                {{ $t("Access Token") }}
                            </option>
                        </select>
                    </div>

                    <div class="mb-3">
                        <label class="form-label">
                            {{
                                credForm.type === "ssh"
                                    ? $t("SSH Private Key")
                                    : $t("Access Token")
                            }}
                        </label>
                        <textarea
                            v-if="credForm.type === 'ssh'"
                            v-model="credForm.data"
                            class="form-control"
                            required
                            rows="10"
                            placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                        ></textarea>
                        <input
                            v-else
                            v-model="credForm.data"
                            type="text"
                            class="form-control"
                            required
                            placeholder="ghp_1234567890abcdef"
                        />
                    </div>

                    <div class="d-flex justify-content-end mt-4">
                        <button
                            type="button"
                            class="btn btn-secondary me-2"
                            @click="showCredModal = false"
                        >
                            {{ $t("Cancel") }}
                        </button>
                        <button
                            type="submit"
                            class="btn btn-primary"
                            :disabled="credFormLoading"
                        >
                            <font-awesome-icon
                                v-if="credFormLoading"
                                icon="spinner"
                                spin
                                class="me-1"
                            />
                            {{ $t("Add") }}
                        </button>
                    </div>
                </form>
            </BModal>
        </div>
    </transition>
</template>

<script>
import { highlight, languages } from "prismjs/components/prism-core";
import { PrismEditor } from "vue-prism-editor";
import "prismjs/components/prism-yaml";
import { parseDocument, Document } from "yaml";

import "prismjs/themes/prism-tomorrow.css";
import "vue-prism-editor/dist/prismeditor.min.css";
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import {
    COMBINED_TERMINAL_COLS,
    COMBINED_TERMINAL_ROWS,
    copyYAMLComments,
    envsubstYAML,
    getCombinedTerminalName,
    getComposeTerminalName,
    PROGRESS_TERMINAL_ROWS,
    RUNNING,
} from "../../../common/util-common";
import { BModal } from "bootstrap-vue-next";
import NetworkInput from "../components/NetworkInput.vue";
import dotenv from "dotenv";
import { socket } from "../mixins/socket";

const template = `
services:
  nginx:
    image: nginx:latest
    restart: unless-stopped
    ports:
      - "8080:80"
`;
const envDefault = "# VARIABLE=value #comment";

let yamlErrorTimeout = null;

let serviceStatusTimeout = null;
let prismjsSymbolDefinition = {
    symbol: {
        pattern: /(?<!\$)\$(\{[^{}]*\}|\w+)/,
    },
};

export default {
    components: {
        NetworkInput,
        FontAwesomeIcon,
        PrismEditor,
        BModal,
    },
    beforeRouteUpdate(to, from, next) {
        this.exitConfirm(next);
    },
    beforeRouteLeave(to, from, next) {
        this.exitConfirm(next);
    },
    yamlDoc: null, // For keeping the yaml comments
    data() {
        return {
            editorFocus: false,
            jsonConfig: {},
            envsubstJSONConfig: {},
            yamlError: "",
            processing: true,
            showProgressTerminal: false,
            progressTerminalRows: PROGRESS_TERMINAL_ROWS,
            combinedTerminalRows: COMBINED_TERMINAL_ROWS,
            combinedTerminalCols: COMBINED_TERMINAL_COLS,
            isGitOpsMode: false,
            repositories: [],
            branches: [],
            composeFiles: [],
            previewYAML: "",
            gitEnvContent: "# VARIABLE=value\n",
            agents: [],
            credentials: [],

            // Repository form
            showRepoModal: false,
            repoForm: {
                name: "",
                url: "",
                branch: "main",
                agentId: null,
                authType: "none",
                authCredentialId: null,
                path: "",
                syncInterval: 0,
                syncIntervalType: "disabled", // For UI selection of sync type
                syncIntervalValue: 60, // Default value for interval
            },
            repoFormLoading: false,
            repoFormError: null,

            // Credential form
            showCredModal: false,
            credForm: {
                name: "",
                type: "ssh",
                data: "",
            },
            credFormLoading: false,
            credFormError: null,

            stack: {
                gitopsEnabled: false,
                repositoryId: null,
                filePath: "",
                gitBranch: "main",
                gitVariables: [],
            },
            serviceStatusList: {},
            isEditMode: false,
            submitted: false,
            showDeleteDialog: false,
            newContainerName: "",
            stopServiceStatusTimeout: false,
        };
    },
    computed: {
        endpointDisplay() {
            return this.$root.endpointDisplayFunction(this.endpoint);
        },

        urls() {
            if (
                !this.envsubstJSONConfig["x-dockge"] ||
                !this.envsubstJSONConfig["x-dockge"].urls ||
                !Array.isArray(this.envsubstJSONConfig["x-dockge"].urls)
            ) {
                return [];
            }

            let urls = [];
            for (const url of this.envsubstJSONConfig["x-dockge"].urls) {
                let display;
                try {
                    let obj = new URL(url);
                    let pathname = obj.pathname;
                    if (pathname === "/") {
                        pathname = "";
                    }
                    display = obj.host + pathname + obj.search;
                } catch (e) {
                    display = url;
                }

                urls.push({
                    display,
                    url,
                });
            }
            return urls;
        },

        isAdd() {
            return this.$route.path === "/compose" && !this.submitted;
        },

        /**
         * Get the stack from the global stack list, because it may contain more real-time data like status
         * @return {*}
         */
        globalStack() {
            return this.$root.completeStackList[
                this.stack.name + "_" + this.endpoint
            ];
        },

        status() {
            return this.globalStack?.status;
        },

        active() {
            return this.status === RUNNING;
        },

        terminalName() {
            if (!this.stack.name) {
                return "";
            }
            return getComposeTerminalName(this.endpoint, this.stack.name);
        },

        combinedTerminalName() {
            if (!this.stack.name) {
                return "";
            }
            return getCombinedTerminalName(this.endpoint, this.stack.name);
        },

        networks() {
            return this.jsonConfig.networks;
        },

        endpoint() {
            return this.stack.endpoint || this.$route.params.endpoint || "";
        },

        url() {
            if (this.stack.endpoint) {
                return `/compose/${this.stack.name}/${this.stack.endpoint}`;
            } else {
                return `/compose/${this.stack.name}`;
            }
        },
    },
    watch: {
        "stack.composeYAML": {
            handler() {
                if (this.editorFocus) {
                    console.debug("yaml code changed");
                    this.yamlCodeChange();
                }
            },
            deep: true,
        },

        "stack.composeENV": {
            handler() {
                if (this.editorFocus) {
                    console.debug("env code changed");
                    this.yamlCodeChange();
                }
            },
            deep: true,
        },

        jsonConfig: {
            handler() {
                if (!this.editorFocus) {
                    console.debug("jsonConfig changed");

                    let doc = new Document(this.jsonConfig);

                    // Stick back the yaml comments
                    if (this.yamlDoc) {
                        copyYAMLComments(doc, this.yamlDoc);
                    }

                    this.stack.composeYAML = doc.toString();
                    this.yamlDoc = doc;
                }
            },
            deep: true,
        },

        $route(to, from) {},
    },
    mounted() {
        if (this.isAdd) {
            this.processing = false;
            this.isEditMode = true;

            let composeYAML;
            let composeENV;

            if (this.$root.composeTemplate) {
                composeYAML = this.$root.composeTemplate;
                this.$root.composeTemplate = "";
            } else {
                composeYAML = template;
            }
            if (this.$root.envTemplate) {
                composeENV = this.$root.envTemplate;
                this.$root.envTemplate = "";
            } else {
                composeENV = envDefault;
            }

            // Default Values
            this.stack = {
                name: "",
                composeYAML,
                composeENV,
                isManagedByDockge: true,
                endpoint: "",
                gitopsEnabled: false,
                repositoryId: null,
                filePath: "",
                gitBranch: "main",
                gitVariables: [],
            };

            this.yamlCodeChange();
        } else {
            this.stack.name = this.$route.params.stackName;
            this.loadStack();
        }

        this.requestServiceStatus();
        this.loadRepositories();
        this.loadAgents();
        this.loadCredentials();
    },
    unmounted() {},
    methods: {
        // GitOps methods
        switchToDirectMode() {
            this.isGitOpsMode = false;
            this.stack.gitopsEnabled = false;
        },

        switchToGitOpsMode() {
            this.isGitOpsMode = true;
            this.stack.gitopsEnabled = true;
            this.loadRepositories();
        },

        showAddRepositoryModal() {
            this.repoForm = {
                name: "",
                url: "",
                branch: "main",
                agentId: null,
                authType: "none",
                authCredentialId: null,
                path: "",
                syncInterval: 0,
                syncIntervalType: "disabled",
                syncIntervalValue: 60,
            };
            this.repoFormError = null;
            this.repoFormLoading = false;
            this.showRepoModal = true;
        },

        updateSyncInterval() {
            // Convert UI interval selection to actual minutes value for the API
            switch (this.repoForm.syncIntervalType) {
                case "disabled":
                    this.repoForm.syncInterval = 0;
                    break;
                case "minutes":
                    this.repoForm.syncInterval = Math.max(
                        5,
                        this.repoForm.syncIntervalValue
                    );
                    break;
                case "hours":
                    this.repoForm.syncInterval = Math.max(
                        60,
                        this.repoForm.syncIntervalValue * 60
                    );
                    break;
                case "days":
                    this.repoForm.syncInterval = 1440; // 24 hours in minutes
                    break;
            }
        },

        resetRepoForm() {
            console.log("Resetting repository form");
            // Reset all form fields
            this.repoForm = {
                name: "",
                url: "",
                branch: "main",
                agentId: null,
                authType: "none",
                authCredentialId: null,
                path: "",
                syncInterval: 0,
                syncIntervalType: "disabled",
                syncIntervalValue: 60,
            };

            // Reset form state
            this.repoFormLoading = false;
            this.repoFormError = null;
        },

        resetCredForm() {
            this.credFormError = null;
            this.credFormLoading = false;
        },

        showAddCredential() {
            this.credForm = {
                name: "",
                type: "ssh",
                data: "",
            };
            this.showCredModal = true;
        },

        saveCredential() {
            this.credFormLoading = true;
            this.credFormError = null;

            // Create credential object with all required properties
            const credential = {
                name: this.credForm.name,
                type: this.credForm.type,
                data: this.credForm.data,
            };

            this.$root.getSocket().emit("addCredential", credential, (res) => {
                this.credFormLoading = false;

                if (res.ok) {
                    this.showCredModal = false;
                    this.loadCredentials();

                    // Select the newly created credential
                    if (res.id) {
                        this.repoForm.authCredentialId = res.id;
                    }
                } else {
                    this.credFormError =
                        res.error || this.$t("Failed to create credential");
                }
            });
        },

        saveRepository() {
            this.repoFormLoading = true;
            this.repoFormError = null;

            // Make sure the sync interval is updated before sending
            this.updateSyncInterval();

            // For troubleshooting
            console.log("Submitting repository form:", this.repoForm);

            // Create a new repository object with all required fields
            const repository = {
                name: this.repoForm.name,
                url: this.repoForm.url,
                branch: this.repoForm.branch || "main",
                agentId:
                    this.repoForm.agentId === "" ? null : this.repoForm.agentId,
                authType: this.repoForm.authType || "none",
                authCredentialId:
                    this.repoForm.authType !== "none"
                        ? this.repoForm.authCredentialId
                        : null,
                path: this.repoForm.path || "",
                syncInterval: this.repoForm.syncInterval || 0,
            };

            // Log connection state for debugging
            console.log(
                "Socket ready state:",
                socket.connected ? "connected" : "disconnected"
            );

            // If socket is not connected, show error and return
            if (!socket.connected) {
                this.repoFormLoading = false;
                this.repoFormError = this.$t(
                    "Socket is not connected. Please refresh and try again."
                );
                return;
            }

            // Set a timeout to prevent UI from hanging indefinitely
            const timeoutId = setTimeout(() => {
                if (this.repoFormLoading) {
                    console.log("Repository creation request timed out");
                    this.repoFormLoading = false;
                    this.repoFormError = this.$t(
                        "Request timed out. Please try again."
                    );
                }
            }, 10000);

            try {
                // Only use one socket method - the direct socket instance
                console.log("Emitting addRepository event");
                socket.emit("addRepository", repository, (res) => {
                    // Clear timeout since we got a response
                    clearTimeout(timeoutId);

                    console.log("Repository creation response:", res);

                    if (!res) {
                        console.error("Empty response from server");
                        this.repoFormLoading = false;
                        this.repoFormError = this.$t(
                            "Invalid response from server"
                        );
                        return;
                    }

                    this.handleRepositoryResponse(res);
                });
            } catch (error) {
                // Clear timeout since we got an error
                clearTimeout(timeoutId);

                console.error("Error sending repository request:", error);
                this.repoFormLoading = false;
                this.repoFormError =
                    error.message || this.$t("Failed to send request");
            }
        },

        loadAgents() {
            this.$root.getSocket().emit("getAgentList", (res) => {
                if (res && res.list) {
                    this.agents = Object.values(res.list);
                }
            });
        },

        loadCredentials() {
            this.$root.getSocket().emit("getCredentialList", (res) => {
                if (res.ok) {
                    this.credentials = res.credentials;
                }
            });
        },

        loadRepositories() {
            console.log("Loading repositories...");
            this.$root.getSocket().emit("getRepositoryList", (res) => {
                console.log("Repository list response:", res);
                if (res && res.ok) {
                    this.repositories = res.repositories || [];
                    console.log("Loaded repositories:", this.repositories);
                    if (
                        this.repositories.length > 0 &&
                        !this.stack.repositoryId
                    ) {
                        this.stack.repositoryId = this.repositories[0].id;
                        this.onRepositoryChange();
                    }
                } else {
                    console.error("Failed to load repositories:", res);
                }
            });
        },

        handleRepositoryResponse(res) {
            // Only process if still loading (to prevent duplicate processing)
            console.log("Handling repository response:", res);

            if (!this.repoFormLoading) {
                console.log("Form already processed, ignoring response");
                return;
            }

            this.repoFormLoading = false;

            if (res && res.ok) {
                console.log("Repository created successfully, ID:", res.id);
                this.showRepoModal = false;
                this.resetRepoForm();
                this.loadRepositories();

                // Select the newly created repository
                if (res.id) {
                    console.log("Setting active repository to:", res.id);
                    this.stack.repositoryId = res.id;
                    this.onRepositoryChange();
                }

                // Show success message
                this.$toast.success(this.$t("Repository created successfully"));
            } else {
                console.error("Repository creation failed:", res);
                this.repoFormError =
                    (res && res.error) || this.$t("Failed to add repository");
            }
        },

        onRepositoryChange() {
            console.log("Repository changed to:", this.stack.repositoryId);
            // Load branches for selected repository
            socket.emit(
                "getRepositoryBranches",
                this.stack.repositoryId,
                (res) => {
                    console.log("Repository branches response:", res);
                    if (res && res.ok) {
                        this.branches = res.branches || [];
                        console.log("Loaded branches:", this.branches);
                        if (this.branches.length > 0) {
                            this.stack.gitBranch = this.branches[0];
                            this.onBranchChange();
                        }
                    } else {
                        console.error("Failed to load branches:", res);
                    }
                }
            );
        },

        onBranchChange() {
            // Scan repository for compose files
            this.$root.getSocket().emit(
                "scanRepository",
                {
                    repositoryId: this.stack.repositoryId,
                    branch: this.stack.gitBranch,
                },
                (res) => {
                    if (res.ok) {
                        this.composeFiles = res.files;
                        if (this.composeFiles.length > 0) {
                            this.stack.filePath = this.composeFiles[0].path;
                            this.loadFileContent();
                        }
                    }
                }
            );
        },

        loadFileContent() {
            // Load file content for preview
            this.$root.getSocket().emit(
                "getFileContent",
                {
                    repositoryId: this.stack.repositoryId,
                    branch: this.stack.gitBranch,
                    path: this.stack.filePath,
                },
                (res) => {
                    if (res.ok) {
                        this.previewYAML = res.content;
                        this.applyVariables();
                    }
                }
            );
        },

        applyVariables() {
            // Apply variables to preview
            let preview = this.previewYAML;
            const envVars = this.parseGitEnvContent();

            for (const key in envVars) {
                const regex = new RegExp(`\\$\\{${key}\\}`, "g");
                preview = preview.replace(regex, envVars[key]);
            }

            this.previewYAML = preview;

            // Update the JSON config from the preview YAML
            try {
                const { config } = this.yamlToJSON(this.previewYAML);
                this.jsonConfig = config;
            } catch (e) {
                console.error("Error parsing preview YAML:", e);
            }
        },

        gitEnvChange() {
            // Convert env file content to variables and update preview
            this.applyVariables();
        },

        parseGitEnvContent() {
            // Parse the env file content into variables object
            return dotenv.parse(this.gitEnvContent);
        },

        // Convert between array and env content
        updateGitEnvFromVariables() {
            let envContent = "";
            if (this.stack.gitVariables && this.stack.gitVariables.length > 0) {
                for (const variable of this.stack.gitVariables) {
                    if (variable.key) {
                        envContent += `${variable.key}=${variable.value}\n`;
                    }
                }
            }
            this.gitEnvContent = envContent || "# VARIABLE=value\n";
        },

        updateVariablesFromGitEnv() {
            const envVars = this.parseGitEnvContent();
            const variables = [];

            for (const key in envVars) {
                variables.push({
                    key: key,
                    value: envVars[key],
                });
            }

            this.stack.gitVariables = variables;
        },

        startServiceStatusTimeout() {
            clearTimeout(serviceStatusTimeout);
            serviceStatusTimeout = setTimeout(async () => {
                this.requestServiceStatus();
            }, 5000);
        },

        requestServiceStatus() {
            // Do not request if it is add mode
            if (this.isAdd) {
                return;
            }

            this.$root.emitAgent(
                this.endpoint,
                "serviceStatusList",
                this.stack.name,
                (res) => {
                    if (res.ok) {
                        this.serviceStatusList = res.serviceStatusList;
                    }
                    if (!this.stopServiceStatusTimeout) {
                        this.startServiceStatusTimeout();
                    }
                }
            );
        },

        exitConfirm(next) {
            if (this.isEditMode) {
                if (confirm(this.$t("confirmLeaveStack"))) {
                    this.exitAction();
                    next();
                } else {
                    next(false);
                }
            } else {
                this.exitAction();
                next();
            }
        },

        exitAction() {
            console.log("exitAction");
            this.stopServiceStatusTimeout = true;
            clearTimeout(serviceStatusTimeout);

            // Leave Combined Terminal
            console.debug(
                "leaveCombinedTerminal",
                this.endpoint,
                this.stack.name
            );
            this.$root.emitAgent(
                this.endpoint,
                "leaveCombinedTerminal",
                this.stack.name,
                () => {}
            );
        },

        bindTerminal() {
            this.$refs.progressTerminal?.bind(this.endpoint, this.terminalName);
        },

        loadStack() {
            this.processing = true;
            this.$root.emitAgent(
                this.endpoint,
                "getStack",
                this.stack.name,
                (res) => {
                    if (res.ok) {
                        this.stack = res.stack;

                        // Check if this is a GitOps-managed stack
                        if (this.stack.gitopsEnabled) {
                            this.isGitOpsMode = true;

                            // Set default if properties don't exist
                            if (!this.stack.gitVariables) {
                                this.stack.gitVariables = [];
                            }

                            // Load GitOps data if this is a GitOps stack
                            this.loadRepositories();

                            // Convert variables object to array if needed
                            if (
                                this.stack.variables &&
                                typeof this.stack.variables === "object" &&
                                !Array.isArray(this.stack.variables)
                            ) {
                                const variablesArray = [];
                                for (const key in this.stack.variables) {
                                    variablesArray.push({
                                        key,
                                        value: this.stack.variables[key],
                                    });
                                }
                                this.stack.gitVariables = variablesArray;
                            }

                            // Update env editor content from variables
                            this.updateGitEnvFromVariables();

                            // Load file content from repository
                            if (this.stack.repositoryId) {
                                this.$root.getSocket().emit(
                                    "getFileContent",
                                    {
                                        repositoryId: this.stack.repositoryId,
                                        branch: this.stack.gitBranch,
                                        path: this.stack.filePath,
                                    },
                                    (fileRes) => {
                                        if (fileRes.ok) {
                                            this.previewYAML = fileRes.content;
                                            this.applyVariables();
                                        }
                                    }
                                );
                            }
                        } else {
                            this.yamlCodeChange();
                        }

                        this.processing = false;
                        this.bindTerminal();
                    } else {
                        this.$root.toastRes(res);
                    }
                }
            );
        },

        deployStack() {
            if (this.isGitOpsMode) {
                this.deployGitOpsStack();
            } else {
                this.deployDirectStack();
            }
        },

        deployGitOpsStack() {
            this.processing = true;

            if (!this.jsonConfig.services) {
                this.$root.toastError("No services found in compose file");
                this.processing = false;
                return;
            }

            // Update variables from env editor
            this.updateVariablesFromGitEnv();

            // Get variables as object
            const variables = this.parseGitEnvContent();

            // Set the stack name if empty using the same logic as direct deployment
            if (!this.stack.name) {
                let serviceNameList = Object.keys(this.jsonConfig.services);
                if (serviceNameList.length > 0) {
                    let serviceName = serviceNameList[0];
                    let service = this.jsonConfig.services[serviceName];

                    if (service && service.container_name) {
                        this.stack.name = service.container_name;
                    } else {
                        this.stack.name = serviceName;
                    }
                }
            }

            this.bindTerminal();

            const deployData = {
                stackName: this.stack.name,
                repositoryId: this.stack.repositoryId,
                filePath: this.stack.filePath,
                branch: this.stack.gitBranch,
                variables,
                endpoint: this.stack.endpoint,
                isAdd: this.isAdd,
            };

            this.$root.emitAgent(
                this.stack.endpoint,
                "deployFromRepository",
                deployData,
                (res) => {
                    this.processing = false;
                    this.$root.toastRes(res);

                    if (res.ok) {
                        this.isEditMode = false;
                        this.$router.push(this.url);
                    }
                }
            );
        },

        deployDirectStack() {
            this.processing = true;

            if (!this.jsonConfig.services) {
                this.$root.toastError("No services found in compose.yaml");
                this.processing = false;
                return;
            }

            // Check if services is object
            if (typeof this.jsonConfig.services !== "object") {
                this.$root.toastError("Services must be an object");
                this.processing = false;
                return;
            }

            let serviceNameList = Object.keys(this.jsonConfig.services);

            // Set the stack name if empty, use the first container name
            if (!this.stack.name && serviceNameList.length > 0) {
                let serviceName = serviceNameList[0];
                let service = this.jsonConfig.services[serviceName];

                if (service && service.container_name) {
                    this.stack.name = service.container_name;
                } else {
                    this.stack.name = serviceName;
                }
            }

            this.bindTerminal();

            this.$root.emitAgent(
                this.stack.endpoint,
                "deployStack",
                this.stack.name,
                this.stack.composeYAML,
                this.stack.composeENV,
                this.isAdd,
                (res) => {
                    this.processing = false;
                    this.$root.toastRes(res);

                    if (res.ok) {
                        this.isEditMode = false;
                        this.$router.push(this.url);
                    }
                }
            );
        },

        saveStack() {
            if (this.isGitOpsMode) {
                this.saveGitOpsStack();
            } else {
                this.saveDirectStack();
            }
        },

        saveGitOpsStack() {
            this.processing = true;

            // Update variables from env editor
            this.updateVariablesFromGitEnv();

            // Get variables as object
            const variables = this.parseGitEnvContent();

            const saveData = {
                stackName: this.stack.name,
                repositoryId: this.stack.repositoryId,
                filePath: this.stack.filePath,
                branch: this.stack.gitBranch,
                variables,
                endpoint: this.stack.endpoint,
                isAdd: this.isAdd,
                gitopsEnabled: true,
            };

            this.$root.emitAgent(
                this.stack.endpoint,
                "saveGitOpsStack",
                saveData,
                (res) => {
                    this.processing = false;
                    this.$root.toastRes(res);

                    if (res.ok) {
                        this.isEditMode = false;
                        this.$router.push(this.url);
                    }
                }
            );
        },

        saveDirectStack() {
            this.processing = true;

            this.$root.emitAgent(
                this.stack.endpoint,
                "saveStack",
                this.stack.name,
                this.stack.composeYAML,
                this.stack.composeENV,
                this.isAdd,
                (res) => {
                    this.processing = false;
                    this.$root.toastRes(res);

                    if (res.ok) {
                        this.isEditMode = false;
                        this.$router.push(this.url);
                    }
                }
            );
        },

        startStack() {
            this.processing = true;

            this.$root.emitAgent(
                this.endpoint,
                "startStack",
                this.stack.name,
                (res) => {
                    this.processing = false;
                    this.$root.toastRes(res);
                }
            );
        },

        stopStack() {
            this.processing = true;

            this.$root.emitAgent(
                this.endpoint,
                "stopStack",
                this.stack.name,
                (res) => {
                    this.processing = false;
                    this.$root.toastRes(res);
                }
            );
        },

        downStack() {
            this.processing = true;

            this.$root.emitAgent(
                this.endpoint,
                "downStack",
                this.stack.name,
                (res) => {
                    this.processing = false;
                    this.$root.toastRes(res);
                }
            );
        },

        restartStack() {
            this.processing = true;

            this.$root.emitAgent(
                this.endpoint,
                "restartStack",
                this.stack.name,
                (res) => {
                    this.processing = false;
                    this.$root.toastRes(res);
                }
            );
        },

        updateStack() {
            this.processing = true;

            this.$root.emitAgent(
                this.endpoint,
                "updateStack",
                this.stack.name,
                (res) => {
                    this.processing = false;
                    this.$root.toastRes(res);
                }
            );
        },

        deleteDialog() {
            this.$root.emitAgent(
                this.endpoint,
                "deleteStack",
                this.stack.name,
                (res) => {
                    this.$root.toastRes(res);
                    if (res.ok) {
                        this.$router.push("/");
                    }
                }
            );
        },

        discardStack() {
            this.loadStack();
            this.isEditMode = false;
        },

        highlighterYAML(code) {
            if (!languages.yaml_with_symbols) {
                languages.yaml_with_symbols = languages.insertBefore(
                    "yaml",
                    "punctuation",
                    {
                        symbol: prismjsSymbolDefinition["symbol"],
                    }
                );
            }
            return highlight(code, languages.yaml_with_symbols);
        },

        highlighterENV(code) {
            if (!languages.docker_env) {
                languages.docker_env = {
                    comment: {
                        pattern: /(^#| #).*$/m,
                        greedy: true,
                    },
                    keyword: {
                        pattern: /^\w*(?=[:=])/m,
                        greedy: true,
                    },
                    value: {
                        pattern: /(?<=[:=]).*?((?= #)|$)/m,
                        greedy: true,
                        inside: {
                            string: [
                                {
                                    pattern: /^ *'.*?(?<!\\)'/m,
                                },
                                {
                                    pattern: /^ *".*?(?<!\\)"|^.*$/m,
                                    inside: prismjsSymbolDefinition,
                                },
                            ],
                        },
                    },
                };
            }
            return highlight(code, languages.docker_env);
        },

        yamlToJSON(yaml) {
            let doc = parseDocument(yaml);
            if (doc.errors.length > 0) {
                throw doc.errors[0];
            }

            const config = doc.toJS() ?? {};

            // Check data types
            // "services" must be an object
            if (!config.services) {
                config.services = {};
            }

            if (
                Array.isArray(config.services) ||
                typeof config.services !== "object"
            ) {
                throw new Error("Services must be an object");
            }

            return {
                config,
                doc,
            };
        },

        yamlCodeChange() {
            try {
                let { config, doc } = this.yamlToJSON(this.stack.composeYAML);

                this.yamlDoc = doc;
                this.jsonConfig = config;

                let env = dotenv.parse(this.stack.composeENV);
                let envYAML = envsubstYAML(this.stack.composeYAML, env);
                this.envsubstJSONConfig = this.yamlToJSON(envYAML).config;

                clearTimeout(yamlErrorTimeout);
                this.yamlError = "";
            } catch (e) {
                clearTimeout(yamlErrorTimeout);

                if (this.yamlError) {
                    this.yamlError = e.message;
                } else {
                    yamlErrorTimeout = setTimeout(() => {
                        this.yamlError = e.message;
                    }, 3000);
                }
            }
        },

        enableEditMode() {
            this.isEditMode = true;
        },

        checkYAML() {},

        addContainer() {
            this.checkYAML();

            if (this.jsonConfig.services[this.newContainerName]) {
                this.$root.toastError("Container name already exists");
                return;
            }

            if (!this.newContainerName) {
                this.$root.toastError("Container name cannot be empty");
                return;
            }

            this.jsonConfig.services[this.newContainerName] = {
                restart: "unless-stopped",
            };
            this.newContainerName = "";
            let element = this.$refs.containerList.lastElementChild;
            element.scrollIntoView({
                block: "start",
                behavior: "smooth",
            });
        },

        stackNameToLowercase() {
            this.stack.name = this.stack?.name?.toLowerCase();
        },
    },
};
</script>

<style scoped lang="scss">
@import "../styles/vars.scss";

.terminal {
    height: 200px;
}

.editor-box {
    font-family: "JetBrains Mono", monospace;
    font-size: 14px;

    &.edit-mode {
        background-color: #2c2f38 !important;
    }
}

.agent-name {
    font-size: 13px;
    color: $dark-font-color3;
}
</style>
