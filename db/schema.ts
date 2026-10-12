import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
export const projects = sqliteTable('cloud_projects', {
  id:text().primaryKey(), owner:text().notNull(), name:text().notNull(), revision:integer().notNull(),
  blob:text().notNull(), updated:integer().notNull(), shareHash:text('share_hash'), shareExpires:integer('share_expires'),
}, t=>[index('idx_cloud_projects_owner').on(t.owner),uniqueIndex('idx_cloud_projects_share').on(t.shareHash)])
export const versions=sqliteTable('cloud_versions',{
  project:text().notNull(),revision:integer().notNull(),blob:text().notNull(),bytes:integer().notNull(),created:integer().notNull(),
},t=>[primaryKey({columns:[t.project,t.revision]}),uniqueIndex('idx_cloud_versions_blob').on(t.blob)])
export const members=sqliteTable('cloud_members',{
  project:text().notNull(),user:text().notNull(),grant:text().notNull(),
},t=>[primaryKey({columns:[t.project,t.user]}),index('idx_cloud_members_user').on(t.user)])
export const comments=sqliteTable('cloud_comments',{
  id:text().primaryKey(),project:text().notNull(),revision:integer().notNull(),author:text().notNull(),
  body:text().notNull(),parent:text(),resolved:integer().notNull().default(0),created:integer().notNull(),
},t=>[index('idx_cloud_comments_project').on(t.project,t.created),index('idx_cloud_comments_author_created').on(t.author,t.created)])
export const preferences=sqliteTable('cloud_preferences',{
  user:text().primaryKey(),payload:text().notNull(),updated:integer().notNull(),
})

export const deletions=sqliteTable('cloud_deletions',{project:text().primaryKey(),owner:text().notNull(),name:text().notNull(),blobs:text().notNull(),bytes:integer().notNull().default(0),ready:integer().notNull().default(1)},t=>[index('idx_cloud_deletions_owner').on(t.owner)])

export const communityModels=sqliteTable('community_models',{
  id:text().primaryKey(),owner:text().notNull(),title:text().notNull(),description:text().notNull(),category:text().notNull(),tags:text().notNull(),license:text().notNull(),creator:text().notNull(),created:integer().notNull(),remixOf:text('remix_of'),image:text(),document:text().notNull(),bytes:integer().notNull(),
},t=>[index('idx_community_models_owner').on(t.owner),index('idx_community_models_created').on(t.created,t.id)])
export const communityComments=sqliteTable('community_comments',{
  id:text().primaryKey(),model:text().notNull(),owner:text().notNull(),author:text().notNull(),body:text().notNull(),parent:text(),created:integer().notNull(),deleted:integer().notNull().default(0),
},t=>[index('idx_community_comments_model').on(t.model,t.created,t.id),index('idx_community_comments_owner').on(t.owner),index('idx_community_comments_parent').on(t.parent)])
export const communityWrites=sqliteTable('community_writes',{
  id:text().primaryKey(),owner:text().notNull(),created:integer().notNull(),
},t=>[index('idx_community_writes_owner_created').on(t.owner,t.created)])
