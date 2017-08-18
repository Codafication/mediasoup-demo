const initialState =
{
	name             : null,
	displayName      : null,
	device           : null,
	canSendMic       : false,
	canSendWebcam    : false,
	canChangeWebcam  : false,
	webcamInProgress : false
};

const me = (state = initialState, action) =>
{
	switch (action.type)
	{
		case 'JOIN_ROOM':
		{
			const { peerName, displayName, device } = action.payload;

			return { ...state, name: peerName, displayName, device };
		}

		case 'SET_MEDIA_CAPABILITIES':
		{
			const { canSendMic, canSendWebcam } = action.payload;

			return { ...state, canSendMic, canSendWebcam };
		}

		case 'SET_CAN_CHANGE_WEBCAM':
		{
			const canChangeWebcam = action.payload;

			return { ...state, canChangeWebcam };
		}

		case 'SET_WEBCAM_IN_PROGRESS':
		{
			const { flag } = action.payload;

			return { ...state, webcamInProgress: flag };
		}

		case 'SET_DISPLAY_NAME':
		{
			const { displayName } = action.payload;

			return { ...state, displayName };
		}

		default:
			return state;
	}
};

export default me;