const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );

const {
	editParagraph,
	flushHistory,
	openHistorySidebar,
	readAllSnapshots,
	readSnapshotContents,
} = require( './utils' );

// Opens a template or pattern from the post, as "Edit template" and "Edit original" do.
const openEntity = ( page, postType, postId ) =>
	page.evaluate(
		( record ) =>
			window.wp.data
				.select( 'core/editor' )
				.getEditorSettings()
				.onNavigateToEntityRecord( record ),
		{ postType, postId }
	);

const waitForPostType = ( page, postType ) =>
	expect
		.poll( () =>
			page.evaluate( () =>
				window.wp.data.select( 'core/editor' ).getCurrentPostType()
			)
		)
		.toBe( postType );

// Finds the block with the given text, or with no text given, the first heading or
// paragraph of the template itself (outside template parts and Post Content).
const findTextBlock = ( text ) => {
	const blockEditor = window.wp.data.select( 'core/block-editor' );
	const outside = [ 'core/template-part', 'core/post-content', 'core/block' ];

	return blockEditor.getClientIdsWithDescendants().find( ( clientId ) => {
		const content = String(
			blockEditor.getBlockAttributes( clientId ).content ?? ''
		);
		if ( text !== null ) {
			return content === text;
		}

		return (
			[ 'core/heading', 'core/paragraph' ].includes(
				blockEditor.getBlockName( clientId )
			) &&
			content.trim() !== '' &&
			! blockEditor
				.getBlockParents( clientId )
				.some( ( parent ) =>
					outside.includes( blockEditor.getBlockName( parent ) )
				)
		);
	} );
};

// Selects a block (see findTextBlock), then changes its text like a user edit.
const editTextBlock = async ( page, content, text = null ) => {
	// The blocks load shortly after the editor switches to the template or pattern.
	await page.waitForFunction(
		( [ source, blockText ] ) =>
			// eslint-disable-next-line no-new-func
			new Function( `return (${ source })` )()( blockText ),
		[ findTextBlock.toString(), text ]
	);
	const clientId = await page.evaluate(
		( [ source, blockText ] ) => {
			// eslint-disable-next-line no-new-func
			const id = new Function( `return (${ source })` )()( blockText );
			window.wp.data.dispatch( 'core/block-editor' ).selectBlock( id );
			return id;
		},
		[ findTextBlock.toString(), text ]
	);
	// Longer than the scan throttle, as between a click and typing.
	await page.waitForTimeout( 500 );
	await page.evaluate(
		( [ id, newContent ] ) =>
			window.wp.data
				.dispatch( 'core/block-editor' )
				.updateBlockAttributes( id, { content: newContent } ),
		[ clientId, content ]
	);
};

const getTrackedIdsInEditor = ( page ) =>
	page.evaluate( () => {
		const blockEditor = window.wp.data.select( 'core/block-editor' );
		return blockEditor
			.getClientIdsWithDescendants()
			.map( ( id ) => blockEditor.getBlockAttributes( id ).blockRewindId )
			.filter( Boolean );
	} );

test.describe( 'Templates and patterns opened from a post', () => {
	let pattern;

	test.beforeAll( async ( { requestUtils } ) => {
		pattern = await requestUtils.rest( {
			method: 'POST',
			path: '/wp/v2/blocks',
			data: {
				title: 'Shared text',
				status: 'publish',
				content:
					'<!-- wp:paragraph --><p>In pattern</p><!-- /wp:paragraph -->',
			},
		} );
	} );

	test.afterAll( async ( { requestUtils } ) => {
		await requestUtils.deleteAllBlocks();
	} );

	const openPostWithPattern = async ( { admin, editor, page } ) => {
		await admin.createNewPost();
		await editor.insertBlock( {
			name: 'core/paragraph',
			attributes: { content: 'Hello' },
		} );
		await editor.insertBlock( {
			name: 'core/block',
			attributes: { ref: pattern.id },
		} );
		await editor.saveDraft();
		const postId = await page.evaluate( () =>
			window.wp.data.select( 'core/editor' ).getCurrentPostId()
		);
		await admin.editPost( postId );
		return postId;
	};

	test( 'saves the post’s edits, pauses in the pattern and resumes in the post', async ( {
		admin,
		editor,
		page,
	} ) => {
		const postId = await openPostWithPattern( { admin, editor, page } );
		const blockId = await editParagraph( { editor, page } );
		const contents = async () =>
			( await readSnapshotContents( page, blockId ) ).map(
				( snapshot ) => snapshot.content
			);
		await expect.poll( contents ).toEqual( [ 'Hello' ] );

		// Opening the pattern saves the post's edit right away, not after a minute.
		await openEntity( page, 'wp_block', pattern.id );
		await waitForPostType( page, 'wp_block' );
		await expect.poll( contents ).toEqual( [ 'Hello', 'Hello world' ] );

		await editTextBlock( page, 'In pattern edited', 'In pattern' );
		await page.waitForTimeout( 500 );
		await flushHistory( page );
		await page.waitForTimeout( 500 );

		expect( await getTrackedIdsInEditor( page ) ).toEqual( [] );
		const snapshots = await readAllSnapshots( page );
		expect(
			snapshots.filter( ( snapshot ) => snapshot.postId !== postId )
		).toEqual( [] );

		const sidebar = await openHistorySidebar( page );
		await expect( sidebar.getByText( 'History is paused' ) ).toBeVisible();

		// Back in the post, edits are tracked again.
		await page
			.getByRole( 'region', { name: 'Editor top bar' } )
			.getByRole( 'button', { name: /back/i } )
			.first()
			.click();
		await waitForPostType( page, 'post' );
		await expect( sidebar.getByText( 'History is paused' ) ).toBeHidden();

		await editParagraph( { editor, page }, ' again' );
		await flushHistory( page );
		await expect
			.poll( contents )
			.toEqual( [ 'Hello', 'Hello world', 'Hello world again' ] );
	} );

	test( 'does not track the template’s blocks', async ( {
		admin,
		editor,
		page,
	} ) => {
		const postId = await openPostWithPattern( { admin, editor, page } );
		// The template loads shortly after the post on WordPress before 7.0.
		const templateId = await (
			await page.waitForFunction( () =>
				window.wp.data.select( 'core/editor' ).getCurrentTemplateId()
			)
		).jsonValue();

		await openEntity( page, 'wp_template', templateId );
		await waitForPostType( page, 'wp_template' );
		await editTextBlock( page, 'Edited template text' );
		await page.waitForTimeout( 500 );
		await flushHistory( page );
		await page.waitForTimeout( 500 );

		expect( await getTrackedIdsInEditor( page ) ).toEqual( [] );
		const snapshots = await readAllSnapshots( page );
		expect(
			snapshots.filter( ( snapshot ) => snapshot.postId !== postId )
		).toEqual( [] );
	} );

	test( 'does not load the runtime in the pattern editor', async ( {
		admin,
		page,
	} ) => {
		await admin.editPost( pattern.id );
		await expect(
			page.locator( 'script#block-rewind-editor-js' )
		).toHaveCount( 0 );
	} );
} );
