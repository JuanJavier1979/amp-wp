/**
 * External dependencies
 */
import PropTypes from 'prop-types';
import { omit } from 'lodash';

/**
 * WordPress dependencies
 */
import { RichText } from '@wordpress/block-editor';

const blockAttributes = {
	ordered: {
		type: 'boolean',
		default: false,
	},
	values: {
		type: 'string',
		source: 'html',
		selector: 'ol,ul',
		multiline: 'li',
		default: '',
	}
};

const saveV120 = ( { attributes } ) => {
	const { ordered, values } = attributes;
	const tagName = ordered ? 'ol' : 'ul';

	return (
		<RichText.Content tagName={ tagName } value={ values } multiline="li" />
	);
};

saveV120.propTypes = {
	attributes: PropTypes.shape( {
		ordered: PropTypes.bool,
		values: PropTypes.string,
	} ).isRequired,
};

const deprecated = [
	{
		attributes: {
			...blockAttributes,
			deprecated: {
				default: '1.2.0',
			},
		},

		supports: {
			className: false,
		},

		save: saveV120,

		migrate: ( attributes ) => {
			return {
				...omit( attributes, [ 'deprecated', 'anchor' ] ),
			};
		},
	},
];

export default deprecated;
