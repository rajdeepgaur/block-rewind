import { select } from '@wordpress/data';

// Shared site content: templates, template parts, synced patterns and menus. The post
// editor can open them without a reload ("Edit template", "Edit original"). Like in the
// Site Editor, they aren't tracked, so no history IDs are saved into them.
const UNTRACKED_POST_TYPES = new Set( [
	'wp_template',
	'wp_template_part',
	'wp_block',
	'wp_navigation',
] );

// Whether the editor shows shared site content instead of the post.
export const isEditingSharedContent = () =>
	UNTRACKED_POST_TYPES.has( select( 'core/editor' ).getCurrentPostType() );
