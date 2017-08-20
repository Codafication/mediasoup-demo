import React from 'react';
import { connect } from 'react-redux';
import ReactTooltip from 'react-tooltip';
import PropTypes from 'prop-types';
import classnames from 'classnames';
import * as appPropTypes from './appPropTypes';
import * as requestActions from '../flux/requestActions';
import PeerInfo from './PeerInfo';
import Stream from './Stream';

class Me extends React.Component
{
	constructor(props)
	{
		super(props);

		this._mounted = false;
		this._rootNode = null;
	}

	render()
	{
		const {
			connected,
			me,
			micProducer,
			webcamProducer,
			onChangeDisplayName,
			onMuteMic,
			onUnmuteMic,
			onEnableWebcam,
			onDisableWebcam,
			onChangeWebcam
		} = this.props;

		let micState;

		if (!me.canSendMic)
			micState = 'unsupported';
		else if (!micProducer)
			micState = 'unsupported';
		else if (!micProducer.locallyPaused)
			micState = 'on';
		else if (micProducer.locallyPaused)
			micState = 'off';

		let webcamState;

		if (!me.canSendWebcam)
			webcamState = 'unsupported';
		else if (webcamProducer)
			webcamState = 'on';
		else
			webcamState = 'off';

		let changeWebcamState;

		if (Boolean(webcamProducer) && me.canChangeWebcam)
			changeWebcamState = 'on';
		else
			changeWebcamState = 'unsupported';

		const videoVisible = (
			Boolean(webcamProducer) &&
			!webcamProducer.locallyPaused &&
			!webcamProducer.remotelyPaused
		);

		let tip;

		if (!me.displayNameSet)
			tip = 'Click on your name to change it';

		return (
			<div
				data-component='Me'
				ref={(node) => (this._rootNode = node)}
				data-tip={tip}
				data-tip-disable={!tip}
				data-type='dark'
			>
				{connected ?
					<div className='controls'>
						<div
							className={classnames('button', 'mic', micState)}
							onClick={() =>
							{
								micState === 'on' ? onMuteMic() : onUnmuteMic();
							}}
						/>

						<div
							className={classnames('button', 'webcam', webcamState, {
								disabled : me.webcamInProgress
							})}
							onClick={() =>
							{
								webcamState === 'on' ? onDisableWebcam() : onEnableWebcam();
							}}
						/>

						<div
							className={classnames('button', 'change-webcam', changeWebcamState, {
								disabled : me.webcamInProgress
							})}
							onClick={() => onChangeWebcam()}
						/>
					</div>
					:null
				}

				<PeerInfo
					isMe
					peer={me}
					onChangeDisplayName={(displayName) => onChangeDisplayName(displayName)}
				/>

				<Stream
					audioTrack={micProducer ? micProducer.track : null}
					videoTrack={webcamProducer ? webcamProducer.track : null}
					visible={videoVisible}
					isMe
				/>

				<ReactTooltip
					effect='solid'
					delayShow={100}
					delayHide={100}
				/>
			</div>
		);
	}

	componentDidMount()
	{
		this._mounted = true;

		setTimeout(() =>
		{
			if (!this._mounted || this.props.me.displayNameSet)
				return;

			ReactTooltip.show(this._rootNode);
		}, 4000);
	}

	componentWillUnmount()
	{
		this._mounted = false;
	}

	componentWillReceiveProps(nextProps)
	{
		if (nextProps.me.displayNameSet)
			ReactTooltip.hide(this._rootNode);
	}
}

Me.propTypes =
{
	connected           : PropTypes.bool.isRequired,
	me                  : appPropTypes.Me.isRequired,
	micProducer         : appPropTypes.Producer,
	webcamProducer      : appPropTypes.Producer,
	onChangeDisplayName : PropTypes.func.isRequired,
	onMuteMic           : PropTypes.func.isRequired,
	onUnmuteMic         : PropTypes.func.isRequired,
	onEnableWebcam      : PropTypes.func.isRequired,
	onDisableWebcam     : PropTypes.func.isRequired,
	onChangeWebcam      : PropTypes.func.isRequired
};

const mapStateToProps = (state) =>
{
	const producersArray = Object.values(state.producers);
	const micProducer =
		producersArray.find((producer) => producer.source === 'mic');
	const webcamProducer =
		producersArray.find((producer) => producer.source === 'webcam');

	return {
		connected      : state.room.state === 'connected',
		me             : state.me,
		micProducer    : micProducer,
		webcamProducer : webcamProducer
	};
};

const mapDispatchToProps = (dispatch) =>
{
	return {
		onChangeDisplayName : (displayName) =>
		{
			dispatch(requestActions.changeDisplayName(displayName));
		},
		onMuteMic       : () => dispatch(requestActions.muteMic()),
		onUnmuteMic     : () => dispatch(requestActions.unmuteMic()),
		onEnableWebcam  : () => dispatch(requestActions.enableWebcam()),
		onDisableWebcam : () => dispatch(requestActions.disableWebcam()),
		onChangeWebcam  : () => dispatch(requestActions.changeWebcam())
	};
};

const MeContainer = connect(
	mapStateToProps,
	mapDispatchToProps
)(Me);

export default MeContainer;
