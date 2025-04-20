<template>
    <div>
        <b-tabs content-class="mt-3">
            <b-tab :title="$t('Repositories')" active>
                <repository-list />
            </b-tab>
            
            <b-tab :title="$t('Credentials')">
                <credential-manager />
            </b-tab>
        </b-tabs>
    </div>
</template>

<script>
import RepositoryList from "../components/git/RepositoryList.vue";
import CredentialManager from "../components/git/CredentialManager.vue";

export default {
    components: {
        RepositoryList,
        CredentialManager
    }
};
</script>