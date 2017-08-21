import React from 'react';
import PropTypes from 'prop-types';
import classnames from 'classnames';
import { RIEInput } from 'riek';
import * as appPropTypes from './appPropTypes';

const PeerInfo = ({ isMe, peer, onChangeDisplayName }) =>
{
	return (
		<div
			data-component='PeerInfo'
			className={classnames({ 'is-me': isMe })}
		>
			{isMe ?
				<RIEInput
					value={peer.displayName}
					propName='displayName'
					className='display-name editable'
					classLoading='loading'
					classInvalid='invalid'
					shouldBlockWhileLoading
					editProps={{
						maxLength   : 20,
						autoCorrect : false,
						spellCheck  : false
					}}
					validate={(string) => string.length >= 3}
					change={({ displayName }) => onChangeDisplayName(displayName)}
				/>
				:
				<span className='display-name'>
					{peer.displayName}
				</span>
			}

			<div className='row'>
				<span
					className={classnames('device-icon', peer.device.flag)}
				/>
				<span className='device-version'>
					{peer.device.name} {Math.floor(peer.device.version)}
				</span>
			</div>
		</div>
	);
};

PeerInfo.propTypes =
{
	isMe : PropTypes.bool,
	peer : PropTypes.oneOfType(
		[ appPropTypes.Me, appPropTypes.Peer ]).isRequired,
	onChangeDisplayName : PropTypes.func
};

export default PeerInfo;
