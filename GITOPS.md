# GitOps Implementation Proposal for Dockge

This document outlines a proposal for adding GitOps capabilities to Dockge, allowing users to deploy Docker Compose stacks directly from Git repositories while maintaining Dockge's multi-tenant architecture.

**Note**: This is a proposal that requires discussion before implementation, as per the contribution guidelines for new features.

## Overview

GitOps in Dockge will enable users to:
- Connect to Git repositories (GitHub, GitLab, Bitbucket, etc.)
- Automatically sync Docker Compose configurations from repositories
- Deploy stacks from specific branches, tags, or commits
- View deployment history and easily rollback
- Configure automated sync intervals

## Architecture

### Core Components

1. **Git Repository Manager**
   - Handles authentication with Git providers
   - Manages repository cloning and updates
   - Tracks repository states across agents

2. **GitOps Service**
   - Coordinates Git operations with stack deployment
   - Manages sync schedules and webhooks
   - Handles error recovery and conflict resolution

3. **Multi-Tenant Integration**
   - Extends agent system to support Git operations
   - Manages repository access per agent
   - Ensures isolation between tenant repositories

### Database Schema

Add the following database models:

**GitRepository**
```typescript
{
  id: number;
  agentId: number;       // Link to agent (null for local)
  name: string;          // Display name
  url: string;           // Git repository URL
  branch: string;        // Default branch
  authType: string;      // "none", "ssh", "token"
  authCredentialId: number; // Link to stored credentials
  path: string;          // Path within repo for compose files
  syncInterval: number;  // Minutes between auto-sync (0 = disabled)
  lastSyncTime: Date;    // Last successful sync
  lastSyncStatus: string; // "success", "failed", etc.
  lastSyncError: string; // Error message if failed
  createdAt: Date;
  updatedAt: Date;
}
```

**GitCredential**
```typescript
{
  id: number;
  name: string;          // Display name
  type: string;          // "ssh", "token", etc.
  data: string;          // Encrypted credential data
  createdAt: Date;
  updatedAt: Date;
}
```

**GitDeployment**
```typescript
{
  id: number;
  repositoryId: number;  // Link to repository
  commitHash: string;    // Git commit hash
  stackName: string;     // Name of deployed stack
  status: string;        // "success", "failed", etc.
  message: string;       // Commit message
  deployedAt: Date;
}
```

## Implementation Steps

### 1. Backend Implementation

#### Git Integration Services

Create the following new files:

**`backend/git-manager.ts`**
- Implement repository cloning, fetching, and checkout operations
- Handle authentication with Git providers
- Manage local Git working directories

**`backend/services/gitops-service.ts`**
- Implement repository synchronization logic
- Scan repositories for Docker Compose files
- Manage deployment history

**`backend/models/git-repository.ts`**, **`backend/models/git-credential.ts`**, **`backend/models/git-deployment.ts`**
- Database model definitions

**`backend/routers/git-router.ts`**
- REST API endpoints for Git repository management
- Webhook endpoints for repository events

**`backend/socket-handlers/git-socket-handler.ts`**
- Socket events for real-time Git operations
- Progress reporting for long-running operations

#### Agent Integration

Extend `agent-socket-handler.ts` and `manage-agent-socket-handler.ts` to:
- Proxy Git operations to remote agents
- Report repository status from agents to main instance
- Synchronize Git credentials securely between instances

### 2. Frontend Implementation

#### UI Components

**`frontend/src/components/git/`**
- `RepositoryList.vue`: List of connected repositories
- `RepositoryForm.vue`: Add/edit repository form
- `CredentialManager.vue`: Manage Git credentials
- `DeploymentHistory.vue`: View deployment history with rollback options

#### Pages

**`frontend/src/pages/GitRepositories.vue`**
- Main page for repository management

**`frontend/src/pages/GitDeployment.vue`**
- Deployment details and history page

### 3. Deployment Workflow

The GitOps workflow will function as follows:

1. **Repository Connection**
   - User adds a Git repository with authentication details
   - System clones repository to a secure location within the agent's filesystem

2. **Discovery**
   - System scans repository for Docker Compose files
   - User selects which files to deploy as stacks

3. **Deployment**
   - User initiates deployment from specific branch/tag
   - System checks out code, applies any template variables
   - Docker Compose stack is deployed through existing stack management

4. **Synchronization**
   - Periodic checks for repository changes
   - Optional webhook support for immediate updates
   - Configurable auto-deploy for changes

5. **History and Rollback**
   - Track all deployments with commit information
   - Enable easy rollback to previous versions

## Security Considerations

1. **Credential Management**
   - Store SSH keys and tokens securely (encrypted in database)
   - Use separate credentials per repository when possible
   - Support SSH agent forwarding for more secure key management

2. **Access Control**
   - Restrict repository operations based on user permissions
   - Consider repository-level access controls

3. **Code Validation**
   - Validate Docker Compose files before deployment
   - Option to restrict variables and capabilities in GitOps deployments

## Multi-Tenancy Support

The GitOps implementation maintains Dockge's multi-tenant architecture by:

1. **Per-Agent Repositories**
   - Git repositories are associated with specific agents
   - Each agent manages its own repository clones and working directories

2. **Credential Isolation**
   - Git credentials are scoped to specific agents
   - Main instance proxies credential-using operations to agents

3. **Repository Proxying**
   - Git operations are executed on the appropriate agent
   - Main instance aggregates and displays results

4. **Remote Webhook Handling**
   - Support webhooks directed to the main instance that trigger operations on remote agents

## Configuration Options

The following configuration options should be available:

1. **Git Working Directory**
   - Base directory for cloned repositories
   - Default: `/opt/git-repositories`

2. **Authentication Settings**
   - SSH key location and generation options
   - Token storage encryption key

3. **Sync Settings**
   - Default sync interval
   - Webhook security options

## Implementation Phases

### Phase 1: Core GitOps Functionality
- Git repository connection and basic authentication
- Manual repository sync and deployment
- Simple deployment history

### Phase 2: Advanced Features
- Automated synchronization
- Webhook integration
- Advanced authentication options
- Deployment templating

### Phase 3: UI Enhancements
- Visual deployment history
- Diff viewer for changes
- Integration with stack management UI

## Testing Strategy

1. **Unit Tests**
   - Git operation handling
   - Repository scanning logic
   - Authentication methods

2. **Integration Tests**
   - End-to-end deployment workflows
   - Multi-agent synchronization
   - Error handling and recovery

3. **Security Tests**
   - Credential handling
   - Access control validation
   - Input validation and sanitization

## Alignment with Project Style

This proposal follows Dockge's project style principles:

1. **User-Friendly Configuration**: All GitOps settings will be configurable through the frontend UI, with minimal environment variables (only for initial setup paths).

2. **Ease of Use**: The implementation emphasizes a straightforward workflow for connecting repositories and deploying stacks.

3. **Consistent UI**: The new UI components will maintain Dockge's existing design patterns and styling.

4. **No Native Dependencies**: The implementation will use pure JavaScript/TypeScript Git libraries without requiring native dependencies.

## Implementation Considerations

- All code will follow the project's 4-space indentation and adhere to the .editorconfig and ESLint rules
- JSDoc documentation will be provided for all methods and functions
- Naming conventions will follow the project standards (camelCase for JS/TS, snake_case for SQLite, kebab-case for CSS)
- The implementation will be structured to minimize changes to existing code, focusing on extension rather than modification