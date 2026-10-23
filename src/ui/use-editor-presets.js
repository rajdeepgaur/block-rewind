import { useSelect } from '@wordpress/data';

// Returns the editor's color, gradient and font size presets and the content width,
// used to name changed settings and to size block previews.
export const useEditorPresets = () =>
	useSelect( ( select ) => {
		const settings = select( 'core/block-editor' ).getSettings();

		return {
			colors: settings.colors,
			gradients: settings.gradients,
			fontSizes: settings.fontSizes,
			contentSize: settings.__experimentalFeatures?.layout?.contentSize,
		};
	}, [] );
