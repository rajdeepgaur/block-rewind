import { Button } from '@wordpress/components';
import { __ } from '@wordpress/i18n';

const Value = ( { value } ) => (
	<span className="block-rewind-change-table__value">
		{ value.swatch && (
			<span
				className="block-rewind-change-table__swatch"
				style={ { background: value.swatch } }
				aria-hidden="true"
			/>
		) }
		{ value.text }
	</span>
);

/**
 * Lists what restoring a version changes, with the value now and after restoring.
 *
 * @param {Object}   props
 * @param {Object[]} props.rows   Rows from getChangeRows().
 * @param {Function} props.onLink Called with a row's `link` ("innerBlocks").
 */
export const ChangeTable = ( { rows, onLink } ) => (
	<table className="block-rewind-change-table">
		<thead>
			<tr>
				<th scope="col">
					{ __( 'Restoring will change', 'block-rewind' ) }
				</th>
				<th scope="col">{ __( 'Now', 'block-rewind' ) }</th>
				<th scope="col">{ __( 'After restoring', 'block-rewind' ) }</th>
			</tr>
		</thead>
		<tbody>
			{ rows.map( ( row ) => (
				<tr key={ row.key }>
					<th scope="row">{ row.label }</th>
					<td>
						<Value value={ row.now } />
					</td>
					<td className="block-rewind-change-table__after">
						<Value value={ row.after } />
						{ row.note && (
							<span className="block-rewind-change-table__note">
								{ row.note }
							</span>
						) }
						{ row.link && (
							<Button
								variant="link"
								onClick={ () => onLink( row.link ) }
							>
								{ __( 'See details', 'block-rewind' ) }
							</Button>
						) }
					</td>
				</tr>
			) ) }
		</tbody>
	</table>
);
