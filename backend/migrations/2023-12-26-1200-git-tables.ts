import { Knex } from "knex";
import { log } from "../log";

export async function up(knex: Knex): Promise<void> {
    log.info("migration", "Adding Git tables for GitOps functionality");

    // Git Credential table (create first since it's referenced by git_repository)
    await knex.schema.createTable("git_credential", (table) => {
        table.increments("id").primary();
        table.string("name").notNullable();
        table.string("type").notNullable();
        table.text("data").notNullable();
        table.dateTime("created_at").notNullable();
        table.dateTime("updated_at").notNullable();
    });

    // Git Repository table
    await knex.schema.createTable("git_repository", (table) => {
        table.increments("id").primary();
        table.string("name").notNullable();
        table.string("url").notNullable();
        table.string("branch").notNullable().defaultTo("main");
        table.integer("agent_id").nullable().references("id").inTable("agent").onDelete("CASCADE");
        table.string("auth_type").notNullable().defaultTo("none");
        table.integer("auth_credential_id").nullable().references("id").inTable("git_credential").onDelete("SET NULL");
        table.string("path").defaultTo("");
        table.integer("sync_interval").defaultTo(0);
        table.dateTime("last_sync_time").nullable();
        table.string("last_sync_status").nullable();
        table.string("last_sync_error").nullable();
        table.dateTime("created_at").notNullable();
        table.dateTime("updated_at").notNullable();
    });

    // Git Deployment table
    await knex.schema.createTable("git_deployment", (table) => {
        table.increments("id").primary();
        table.integer("repository_id").notNullable().references("id").inTable("git_repository").onDelete("CASCADE");
        table.string("commit_hash").notNullable();
        table.string("stack_name").notNullable();
        table.string("status").notNullable();
        table.string("message").nullable();
        table.dateTime("deployed_at").notNullable();
    });

    // Add indexes for common queries
    await knex.schema.raw("CREATE INDEX IF NOT EXISTS idx_git_repository_agent ON git_repository(agent_id)");
    await knex.schema.raw("CREATE INDEX IF NOT EXISTS idx_git_deployment_repository ON git_deployment(repository_id)");
    await knex.schema.raw("CREATE INDEX IF NOT EXISTS idx_git_deployment_stack ON git_deployment(stack_name)");

    log.info("migration", "Git tables created successfully");
}

export async function down(knex: Knex): Promise<void> {
    // Drop tables in reverse order to handle foreign key constraints
    await knex.schema.dropTableIfExists("git_deployment");
    await knex.schema.dropTableIfExists("git_repository");
    await knex.schema.dropTableIfExists("git_credential");
}