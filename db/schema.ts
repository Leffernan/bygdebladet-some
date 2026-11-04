import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
export const posts = sqliteTable('posts', {
  id: text('id').primaryKey(), url: text('url').notNull().unique(),
  title: text('title').notNull(), intro: text('intro').notNull().default(''),
  category: text('category').notNull().default('Nyheiter'), imageUrl: text('image_url').notNull(),
  credit: text('credit').notNull().default(''), ai: integer('ai').notNull().default(0),
  cropX: real('crop_x').notNull().default(0.5), cropY: real('crop_y').notNull().default(0.4),
  facebookText: text('facebook_text').notNull(), instagramText: text('instagram_text').notNull(),
  altText: text('alt_text').notNull().default(''), channels: text('channels').notNull().default('["facebook","instagram"]'),
  warnings: text('warnings').notNull().default('[]'), rank: integer('rank').notNull().default(0),
  state: text('state').notNull().default('draft'), revision: integer('revision').notNull().default(1),
  approvedRevision: integer('approved_revision'), approvedBy: text('approved_by'), approvedAt: text('approved_at'),
  imageKey: text('image_key'), imageHash: text('image_hash'),
  createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull(),
});
export const deliveries = sqliteTable('deliveries', {
  id: text('id').primaryKey(), postId: text('post_id').notNull(), channel: text('channel').notNull(),
  revision: integer('revision').notNull(), state: text('state').notNull().default('ready'),
  remoteId: text('remote_id'), remoteUrl: text('remote_url'), containerId: text('container_id'),
  stageId: text('stage_id'), error: text('error'), updatedAt: text('updated_at').notNull(),
});
export const events = sqliteTable('events', {
  id: text('id').primaryKey(), postId: text('post_id'), kind: text('kind').notNull(),
  message: text('message').notNull(), actor: text('actor').notNull(), createdAt: text('created_at').notNull(),
});
export const settings = sqliteTable('settings', { key: text('key').primaryKey(), value: text('value').notNull() });
export const jobs = sqliteTable('jobs', {
  id: text('id').primaryKey(), state: text('state').notNull(), startedAt: text('started_at').notNull(),
  finishedAt: text('finished_at'), result: text('result'),
});
// User-provided Meta credential. The encryption key is a protected Sites secret.
export const metaConnections = sqliteTable('meta_connections', {
  id: text('id').primaryKey(), tokenCiphertext: text('token_ciphertext').notNull(),
  pageId: text('page_id').notNull(), instagramId: text('instagram_id').notNull(),
  apiVersion: text('api_version').notNull(), pageName: text('page_name').notNull(),
  instagramUsername: text('instagram_username').notNull(), tokenExpiresAt: text('token_expires_at').notNull(),
  publishingEnabled: integer('publishing_enabled').notNull().default(0),
  updatedBy: text('updated_by').notNull(), updatedAt: text('updated_at').notNull(),
});
