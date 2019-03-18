/**
 * External dependencies
 */
import { every } from 'lodash';

/**
 * WordPress dependencies
 */
import { addFilter } from '@wordpress/hooks';
import { render } from '@wordpress/element';
import domReady from '@wordpress/dom-ready';
import { select, subscribe, dispatch } from '@wordpress/data';
import { createBlock, getDefaultBlockName, setDefaultBlockName, getBlockTypes, unregisterBlockType } from '@wordpress/blocks';
const { moveBlockToPosition, updateBlockAttributes } = dispatch( 'core/editor' );

/**
 * Internal dependencies
 */
import {
	withAmpStorySettings,
	withAnimationControls,
	withPageNumber,
	withWrapperProps,
	withActivePageState,
	withStoryBlockDropZone,
	BlockNavigation,
	EditorCarousel,
	StoryControls,
	Shortcuts,
} from './components';
import { ALLOWED_BLOCKS, ALLOWED_CHILD_BLOCKS } from './constants';
import { maybeEnqueueFontStyle, setBlockParent, addAMPAttributes, addAMPExtraProps } from './helpers';
import store from './stores/amp-story';

const { getBlockOrder, getBlock, getBlocksByClientId, getClientIdsWithDescendants, getBlockRootClientId } = select( 'core/editor' );

/**
 * Initialize editor integration.
 */
domReady( () => {
	const { addAnimation, setCurrentPage } = dispatch( 'amp/story' );

	// Ensure that the default block is page when no block is selected.
	setDefaultBlockName( 'amp/amp-story-page' );

	// Remove all blocks that aren't whitelisted.
	const disallowedBlockTypes = getBlockTypes().filter( ( { name } ) => ! ALLOWED_BLOCKS.includes( name ) );

	for ( const blockType of disallowedBlockTypes ) {
		unregisterBlockType( blockType.name );
	}

	const allBlocks = getBlocksByClientId( getClientIdsWithDescendants() );

	// Set initially shown page.
	const firstPage = allBlocks.find( ( { name } ) => name === 'amp/amp-story-page' );
	setCurrentPage( firstPage ? firstPage.clientId : undefined );

	for ( const block of allBlocks ) {
		const page = getBlockRootClientId( block.clientId );

		// Set initial animation order state.
		if ( page ) {
			const ampAnimationAfter = block.attributes.ampAnimationAfter;
			const predecessor = allBlocks.find( ( b ) => b.attributes.anchor === ampAnimationAfter );

			addAnimation( page, block.clientId, predecessor ? predecessor.clientId : undefined );
		}

		// Load all needed fonts.
		if ( block.attributes.ampFontFamily ) {
			maybeEnqueueFontStyle( block.attributes.ampFontFamily );
		}
	}

	renderStoryComponents();

	// Prevent WritingFlow component from focusing on last text field when clicking below the carousel.
	document.querySelector( '.editor-writing-flow__click-redirect' ).remove();
} );

/**
 * Add some additional elements needed to render our custom UI controls.
 */
function renderStoryComponents() {
	const editorBlockList = document.querySelector( '.editor-block-list__layout' );
	const editorBlockNavigation = document.querySelector( '.editor-block-navigation' );

	if ( editorBlockList ) {
		const ampStoryWrapper = document.createElement( 'div' );
		ampStoryWrapper.id = 'amp-story-editor';

		const blockNavigation = document.createElement( 'div' );
		blockNavigation.id = 'amp-root-navigation';

		const editorCarousel = document.createElement( 'div' );
		editorCarousel.id = 'amp-story-editor-carousel';

		const storyControls = document.createElement( 'div' );
		storyControls.id = 'amp-story-controls';

		/**
		 * The intended layout is as follows:
		 *
		 * - Post title
		 * - AMP story wrapper element (needed for overflow styling)
		 * - - Story controls
		 * - - Block list
		 * - - Block navigation
		 * - - Carousel controls
		 */
		editorBlockList.parentNode.replaceChild( ampStoryWrapper, editorBlockList );
		ampStoryWrapper.appendChild( storyControls );
		ampStoryWrapper.appendChild( editorBlockList );
		ampStoryWrapper.appendChild( blockNavigation );
		ampStoryWrapper.appendChild( editorCarousel );

		render(
			<StoryControls />,
			storyControls
		);

		render(
			<div key="blockNavigation" className="block-navigation">
				<BlockNavigation />
			</div>,
			blockNavigation
		);

		render(
			<div key="pagesCarousel" className="editor-carousel">
				<EditorCarousel />
			</div>,
			editorCarousel
		);
	}

	if ( editorBlockNavigation ) {
		const shortcuts = document.createElement( 'div' );
		shortcuts.id = 'amp-story-shortcuts';

		editorBlockNavigation.parentNode.parentNode.insertBefore( shortcuts, editorBlockNavigation.parentNode.nextSibling );

		render(
			<Shortcuts />,
			shortcuts
		);
	}
}

const positionTopLimit = 75;
const positionTopHighest = 0;
const positionTopGap = 10;

/**
 * Set initial positioning if the selected block is an unmodified block.
 *
 * @param {number} clientId Selected block's ID.
 */
function maybeSetInitialPositioning( clientId ) {
	const block = getBlock( clientId );

	if ( ! block || ! ALLOWED_CHILD_BLOCKS.includes( block.name ) ) {
		return;
	}

	const parentBlock = getBlock( getBlockRootClientId( clientId ) );
	// Short circuit if the top position is already set or the block has no parent.
	if ( 0 !== block.attributes.positionTop || ! parentBlock ) {
		return;
	}

	// Check if it's a new block.
	const newBlock = createBlock( block.name );
	const isUnmodified = every( newBlock.attributes, ( value, key ) => value === block.attributes[ key ] );

	// Only set the position if the block was unmodified before.
	if ( isUnmodified ) {
		const highestPositionTop = parentBlock.innerBlocks
			.map( ( childBlock ) => childBlock.attributes.positionTop )
			.reduce( ( highestTop, positionTop ) => Math.max( highestTop, positionTop ), 0 );

		// If it's more than the limit, set the new one.
		const newPositionTop = highestPositionTop > positionTopLimit ? positionTopHighest : highestPositionTop + positionTopGap;

		updateBlockAttributes( clientId, { positionTop: newPositionTop } );
	}
}

let blockOrder = getBlockOrder();
let allBlocksWithChildren = getClientIdsWithDescendants();

subscribe( () => {
	const { getSelectedBlockClientId } = select( 'core/editor' );
	const { getCurrentPage } = select( 'amp/story' );
	const { setCurrentPage } = dispatch( 'amp/story' );
	const defaultBlockName = getDefaultBlockName();
	const selectedBlockClientId = getSelectedBlockClientId();

	// Switch default block depending on context
	if ( selectedBlockClientId ) {
		const selectedBlock = getBlock( selectedBlockClientId );

		if ( 'amp/amp-story-page' === selectedBlock.name && 'amp/amp-story-page' !== defaultBlockName ) {
			setDefaultBlockName( 'amp/amp-story-page' );
		} else if ( 'amp/amp-story-page' !== selectedBlock.name && 'amp/amp-story-text' !== defaultBlockName ) {
			setDefaultBlockName( 'amp/amp-story-text' );
		}
	} else if ( ! selectedBlockClientId && 'amp/amp-story-page' !== defaultBlockName ) {
		setDefaultBlockName( 'amp/amp-story-page' );
	}

	const newBlockOrder = getBlockOrder();
	const newlyAddedPages = newBlockOrder.find( ( block ) => ! blockOrder.includes( block ) );
	const deletedPages = blockOrder.filter( ( block ) => ! newBlockOrder.includes( block ) );

	if ( deletedPages.includes( getCurrentPage() ) ) {
		// Change current page if it has been deleted.
		const nextIndex = Math.max( 0, blockOrder.indexOf( getCurrentPage() ) - 1 );

		blockOrder = newBlockOrder;

		setCurrentPage( blockOrder[ nextIndex ] );
	}

	blockOrder = newBlockOrder;

	// If a new page has been inserted, make it the current one.
	if ( newlyAddedPages ) {
		setCurrentPage( newlyAddedPages );
	}

	for ( const block of allBlocksWithChildren ) {
		maybeSetInitialPositioning( block );
	}

	allBlocksWithChildren = getClientIdsWithDescendants();
} );

const { isReordering, getBlockOrder: getCustomBlockOrder, getAnimationOrder } = select( 'amp/story' );

store.subscribe( () => {
	const editorBlockOrder = getBlockOrder();
	const customBlockOrder = getCustomBlockOrder();

	// The block order has changed, let's re-order.
	if ( ! isReordering() && customBlockOrder.length > 0 && editorBlockOrder !== customBlockOrder ) {
		for ( const [ index, page ] of customBlockOrder.entries() ) {
			moveBlockToPosition( page, '', '', index );
		}
	}

	const animationOrder = getAnimationOrder();

	for ( const page in animationOrder ) {
		if ( ! animationOrder.hasOwnProperty( page ) ) {
			continue;
		}

		for ( const item of animationOrder[ page ] ) {
			const parentBlock = item.parent ? getBlock( item.parent ) : undefined;

			updateBlockAttributes( item.id, { ampAnimationAfter: parentBlock ? parentBlock.attributes.anchor : undefined } );
		}
	}
} );

addFilter( 'blocks.registerBlockType', 'ampStoryEditorBlocks/setBlockParent', setBlockParent );
addFilter( 'blocks.registerBlockType', 'ampStoryEditorBlocks/addAttributes', addAMPAttributes );
addFilter( 'editor.BlockEdit', 'ampStoryEditorBlocks/addAnimationControls', withAnimationControls );
addFilter( 'editor.BlockEdit', 'ampStoryEditorBlocks/addStorySettings', withAmpStorySettings );
addFilter( 'editor.BlockEdit', 'ampStoryEditorBlocks/addPageNumber', withPageNumber );
addFilter( 'editor.BlockListBlock', 'ampStoryEditorBlocks/withActivePageState', withActivePageState );
addFilter( 'editor.BlockListBlock', 'ampStoryEditorBlocks/addWrapperProps', withWrapperProps );
addFilter( 'blocks.getSaveContent.extraProps', 'ampStoryEditorBlocks/addExtraAttributes', addAMPExtraProps );
addFilter( 'editor.BlockDropZone', 'ampStoryEditorBlocks/withStoryBlockDropZone', withStoryBlockDropZone );