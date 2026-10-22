const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );

const RUNTIME_SCRIPT = 'script#block-rewind-editor-js';

test.describe( 'Editor integration', () => {
	test( 'loads the runtime in the post editor', async ( { admin, page } ) => {
		await admin.createNewPost();

		await expect( page.locator( RUNTIME_SCRIPT ) ).toHaveCount( 1 );
	} );

	test( 'does not load the runtime in the Site Editor', async ( {
		admin,
		page,
	} ) => {
		await admin.visitSiteEditor();
		await expect( page.locator( RUNTIME_SCRIPT ) ).toHaveCount( 0 );
	} );

	test.describe( 'with a classic theme', () => {
		test.beforeAll( async ( { requestUtils } ) => {
			await requestUtils.activateTheme( 'twentytwentyone' );
		} );

		test.afterAll( async ( { requestUtils } ) => {
			await requestUtils.activateTheme( 'twentytwentyfive' );
		} );

		test( 'does not load the runtime in the block Widgets editor', async ( {
			admin,
			page,
		} ) => {
			await admin.visitAdminPage( 'widgets.php' );
			await expect(
				page
					.locator(
						'.edit-widgets-header, .edit-widgets-block-editor'
					)
					.first()
			).toBeVisible();
			await expect( page.locator( RUNTIME_SCRIPT ) ).toHaveCount( 0 );
		} );
	} );

	test( 'keeps the default padding of core editor modals', async ( {
		admin,
		page,
		pageUtils,
	} ) => {
		await admin.createNewPost();
		await pageUtils.pressKeys( 'access+h' );

		const modalContent = page.locator(
			'.edit-post-keyboard-shortcut-help-modal .components-modal__content, .editor-keyboard-shortcut-help-modal .components-modal__content'
		);
		await expect( modalContent ).toBeVisible();

		const paddingLeft = await modalContent.evaluate( ( element ) =>
			parseFloat( window.getComputedStyle( element ).paddingLeft )
		);
		expect( paddingLeft ).toBeGreaterThan( 0 );
	} );

	test( 'server-side rendered blocks accept the block ID attribute', async ( {
		admin,
		editor,
		page,
	} ) => {
		await admin.createNewPost();

		const rendererResponse = page.waitForResponse(
			( response ) =>
				response.url().includes( 'block-renderer' ) &&
				response.url().includes( 'archives' )
		);
		await editor.insertBlock( { name: 'core/archives' } );
		expect( ( await rendererResponse ).status() ).toBe( 200 );

		// Selecting the block assigns a non-empty ID and triggers another render request.
		await editor.canvas.locator( '[data-type="core/archives"]' ).click();
		await expect(
			editor.canvas.getByText( /Error loading block/i )
		).toHaveCount( 0 );

		const renderStatus = await page.evaluate( async () => {
			const response = await window.wp.apiFetch( {
				path: '/wp/v2/block-renderer/core/archives?context=edit',
				method: 'POST',
				data: { attributes: { blockRewindId: 'block-rewind-e2e' } },
				parse: false,
			} );
			return response.status;
		} );
		expect( renderStatus ).toBe( 200 );
	} );
} );
