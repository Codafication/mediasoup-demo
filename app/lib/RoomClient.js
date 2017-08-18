import protooClient from 'protoo-client';
import * as mediasoupClient from 'mediasoup-client';
import Logger from './Logger';
import { getProtooUrl } from './urlFactory';
import * as cookiesManager from './cookiesManager';
import * as actionCreators from './flux/actionCreators';

const logger = new Logger('RoomClient');

const ROOM_OPTIONS =
{
	requestTimeout   : 10000,
	transportOptions :
	{
		tcp : false
	},
	hidden : false
};

const VIDEO_CONSTRAINS =
{
	qvga : { width: { ideal: 320 }, height: { ideal: 240 } },
	vga  : { width: { ideal: 640 }, height: { ideal: 480 } },
	hd   : { width: { ideal: 1280 }, height: { ideal: 720 } }
};

export default class RoomClient
{
	constructor({ roomId, peerName, displayName, device, dispatch, getState })
	{
		logger.debug(
			'constructor() [peerName:"%s", roomId:"%s"]', peerName, roomId);

		const protooUrl = getProtooUrl(peerName, roomId);
		const protooTransport = new protooClient.WebSocketTransport(protooUrl);

		// Closed flag.
		this._closed = false;

		// Flux store dispatch function.
		this._dispatch = dispatch;

		// Flux store state getter.
		this._getState = getState;

		// protoo-client Peer instance.
		this._protoo = new protooClient.Peer(protooTransport);

		// mediasoup-client Room instance.
		this._room = new mediasoupClient.Room(ROOM_OPTIONS);

		// Transport for sending.
		this._sendTransport = null;

		// Transport for receiving.
		this._recvTransport = null;

		// Local mic mediasoup Producer.
		this._micProducer = null;

		// Local webcam mediasoup Producer.
		this._webcamProducer = null;

		// Map of webcam MediaDeviceInfos indexed by deviceId.
		// @type {Map<String, MediaDeviceInfos>}
		this._webcams = new Map();

		// Local Webcam. Object with:
		// - {MediaDeviceInfo} [device]
		// - {String} [resolution] - 'qvga' / 'vga' / 'hd'.
		this._webcam =
		{
			device     : null,
			resolution : 'vga'
		};

		this._join({ displayName, device });
	}

	close()
	{
		if (this._closed)
			return;

		this._closed = true;

		logger.debug('close()');

		// Leave the mediasoup Room.
		this._room.leave();

		// Close protoo Peer (wait a bit so mediasoup-client can send
		// the 'leaveRoom' notification).
		setTimeout(() => this._protoo.close(), 250);

		this._dispatch(actionCreators.setRoomState('closed'));
	}

	// getConsumerById(peerName, consumerId)
	// {
	// 	const peer = this._room.getPeerByName(peerName);

	// 	if (!peer)
	// 		return;

	// 	return peer.getConsumerById(consumerId);
	// }

	setDisplayName(displayName)
	{
		logger.debug('setDisplayName() [displayName:"%s"]', displayName);

		// Store in cookie.
		cookiesManager.setUser({ displayName });

		this._protoo.send('set-display-name', { displayName })
			.catch((error) =>
			{
				logger.error('setDisplayName() | failed: %o', error);
			});
	}

	muteMic()
	{
		logger.debug('muteMic()');

		this._micProducer.pause();
	}

	unmuteMic()
	{
		logger.debug('unmuteMic()');

		this._micProducer.resume();
	}

	removeWebcam()
	{
		logger.debug('removeWebcam()');

		// Store in cookie.
		cookiesManager.setDevices({ webcamEnabled: false });

		return Promise.resolve()
			.then(() =>
			{
				this._webcamProducer.close();
			})
			.catch((error) =>
			{
				logger.error('removeWebcam() | failed: %o', error);
			});
	}

	addWebcam()
	{
		logger.debug('addWebcam()');

		// Store in cookie.
		cookiesManager.setDevices({ webcamEnabled: true });

		return Promise.resolve()
			.then(() =>
			{
				return this._updateWebcams();
			})
			.then(() =>
			{
				return this._setWebcamProducer();
			})
			.catch((error) =>
			{
				logger.error('addWebcam() | failed: %o', error);
			});
	}

	changeWebcam()
	{
		logger.debug('changeWebcam()');

		return Promise.resolve()
			.then(() =>
			{
				return this._updateWebcams();
			})
			.then(() =>
			{
				const array = Array.from(this._webcams.keys());
				const len = array.length;
				const deviceId =
					this._webcam.device ? this._webcam.device.deviceId : undefined;
				let idx = array.indexOf(deviceId);

				if (idx < len - 1)
					idx++;
				else
					idx = 0;

				this._webcam.device = this._webcams.get(array[idx]);

				logger.debug(
					'changeWebcam() | new selected webcam [device:%o]',
					this._webcam.device);

				// Reset video resolution to VGA.
				this._webcam.resolution = 'vga';
			})
			.then(() =>
			{
				const { device, resolution } = this._webcam;

				if (!device)
					throw new Error('no webcam devices');

				return navigator.mediaDevices.getUserMedia(
					{
						video :
						{
							deviceId : { exact: device.deviceId },
							...VIDEO_CONSTRAINS[resolution]
						}
					});
			})
			.then((stream) =>
			{
				const track = stream.getVideoTracks()[0];

				return this._webcamProducer.replaceTrack(track);
			})
			.then((newTrack) =>
			{
				this._dispatch(
					actionCreators.replaceProducerTrack(this._webcamProducer.id, newTrack));
			})
			.catch((error) =>
			{
				logger.error('changeWebcam() failed: %o', error);
			});
	}

	changeWebcamResolution()
	{
		logger.debug('changeWebcamResolution()');

		let oldResolution;
		let newResolution;

		return Promise.resolve()
			.then(() =>
			{
				oldResolution = this._webcam.resolution;

				switch (oldResolution)
				{
					case 'qvga':
						newResolution = 'vga';
						break;
					case 'vga':
						newResolution = 'hd';
						break;
					case 'hd':
						newResolution = 'qvga';
						break;
					default:
						throw new Error(`unknown resolution "${this._webcam.resolution}"`);
				}

				this._webcam.resolution = newResolution;
			})
			.then(() =>
			{
				const { device, resolution } = this._webcam;

				return navigator.mediaDevices.getUserMedia(
					{
						video :
						{
							deviceId : { exact: device.deviceId },
							...VIDEO_CONSTRAINS[resolution]
						}
					});
			})
			.then((stream) =>
			{
				const track = stream.getVideoTracks()[0];

				return this._webcamProducer.replaceTrack(track);
			})
			.then((newTrack) =>
			{
				this._dispatch(
					actionCreators.replaceProducerTrack(this._webcamProducer.id, newTrack));
			})
			.catch((error) =>
			{
				logger.error('changeWebcamResolution() failed: %o', error);

				this._webcam.resolution = oldResolution;
			});
	}

	_join({ displayName, device })
	{
		this._dispatch(actionCreators.setRoomState('connecting'));

		const protoo = this._protoo;

		protoo.on('open', () =>
		{
			logger.debug('protoo Peer "open" event');

			this._joinRoom({ displayName, device });
		});

		protoo.on('disconnected', () =>
		{
			logger.warn('protoo Peer "disconnected" event');

			this._dispatch(actionCreators.showNotification(
				{
					type : 'error',
					text : 'WebSocket disconnected'
				}));

			// Leave Room.
			try { this._room.remoteClose({ cause: 'protoo disconnected' }); }
			catch (error) {}

			this._dispatch(actionCreators.setRoomState('connecting'));
		});

		protoo.on('close', () =>
		{
			if (this._closed)
				return;

			logger.warn('protoo Peer "close" event');

			this.close();
		});

		this._protoo.on('request', (request, accept, reject) =>
		{
			logger.debug(
				'_handleProtooRequest() [method:%s, data:%o]',
				request.method, request.data);

			accept();

			switch (request.method)
			{
				case 'mediasoup-notification':
				{
					const notification = request.data;

					this._room.receiveNotification(notification);

					break;
				}

				default:
				{
					logger.error('unknown protoo method "%s"', request.method);

					reject(404, 'unknown method');
				}
			}
		});
	}

	_joinRoom({ displayName, device })
	{
		logger.debug('_joinRoom()');

		// NOTE: We allow rejoining (room.join()) the same mediasoup Room when Protoo
		// WebSocket re-connects, so we must clean existing event listeners. Otherwise
		// they will be called twice after the reconnection.
		this._room.removeAllListeners();

		this._room.on('request', (request, callback, errback) =>
		{
			logger.debug(
				'sending mediasoup request [method:%s]:%o', request.method, request);

			this._protoo.send('mediasoup-request', request)
				.then(callback)
				.catch(errback);
		});

		this._room.on('notify', (notification) =>
		{
			logger.debug(
				'sending mediasoup notification [method:%s]:%o',
				notification.method, notification);

			this._protoo.send('mediasoup-notification', notification);
		});

		this._room.on('newpeer', (peer) =>
		{
			logger.debug(
				'room "newpeer" event [name:"%s", peer:%o]', peer.name, peer);

			this._handlePeer(peer);
		});

		this._room.join(null, { displayName, device })
			.then(() =>
			{
				// Create Transport for sending.
				this._sendTransport =
					this._room.createTransport('send', { media: 'SEND_MIC_WEBCAM' });

				// Create Transport for receiving.
				this._recvTransport =
					this._room.createTransport('recv', { media: 'RECV' });
			})
			.then(() =>
			{
				// Set our media capabilities.
				this._dispatch(actionCreators.setMediaCapabilities(
					{
						canSendMic    : this._room.canSend('audio'),
						canSendWebcam : this._room.canSend('video')
					}));
			})
			.then(() =>
			{
				// Add our mic.
				if (this._room.canSend('audio'))
				{
					this._setMicProducer()
						.catch(() => {});
				}
			})
			.then(() =>
			{
				// Add our webcam (unless the cookie says no).
				if (this._room.canSend('video'))
				{
					const devicesCookie = cookiesManager.getDevices();

					if (!devicesCookie || devicesCookie.webcamEnabled)
						this.addWebcam();
				}
			})
			.then(() =>
			{
				this._dispatch(actionCreators.setRoomState('connected'));

				// Clean all the existing notifcations.
				for (const notification of this._getState().notifications)
				{
					this._dispatch(
						actionCreators.deleteNotification(notification.id));
				}

				this._dispatch(actionCreators.showNotification(
					{
						text : 'You are in the room'
					}));

				const peers = this._room.peers;

				for (const peer of peers)
				{
					this._handlePeer(peer, { notify: false });
				}
			})
			.catch((error) =>
			{
				logger.error('_joinRoom() failed:%o', error);

				this._dispatch(actionCreators.showNotification(
					{
						type : 'error',
						text : `Could not join the room: ${error.toString()}`
					}));

				this.close();
			});
	}

	_setMicProducer()
	{
		if (!this._room.canSend('audio'))
		{
			return Promise.reject(
				new Error('cannot send audio'));
		}

		if (this._micProducer)
		{
			return Promise.reject(
				new Error('mic Producer already exists'));
		}

		let producer;

		return Promise.resolve()
			.then(() =>
			{
				return navigator.mediaDevices.getUserMedia({ audio: true });
			})
			.then((stream) =>
			{
				const track = stream.getAudioTracks()[0];

				producer = this._room.createProducer(track);

				// No need to keep original track.
				track.stop();

				// Send it.
				return this._sendTransport.send(producer);
			})
			.then(() =>
			{
				this._micProducer = producer;

				this._dispatch(actionCreators.newProducer(
					{
						id             : producer.id,
						source         : 'mic',
						locallyPaused  : producer.locallyPaused,
						remotelyPaused : producer.remotelyPaused,
						track          : producer.track
					}));

				producer.on('closed', (originator) =>
				{
					logger.debug(
						'mic Producer "closed" event [originator:%s]', originator);

					this._micProducer = null;
					this._dispatch(actionCreators.producerClosed(producer.id));
				});

				producer.on('paused', (originator) =>
				{
					logger.debug(
						'mic Producer "paused" event [originator:%s]', originator);

					this._dispatch(actionCreators.producerPaused(producer.id, originator));
				});

				producer.on('resumed', (originator) =>
				{
					logger.debug(
						'mic Producer "resumed" event [originator:%s]', originator);

					this._dispatch(actionCreators.producerResumed(producer.id, originator));
				});
			})
			.then(() =>
			{
				logger.debug('_setMicProducer() succeeded');
			})
			.catch((error) =>
			{
				logger.error('_setMicProducer() failed:%o', error);

				if (producer)
					producer.close();

				throw error;
			});
	}

	_setWebcamProducer()
	{
		if (!this._room.canSend('video'))
		{
			return Promise.reject(
				new Error('cannot send video'));
		}

		if (this._webcamProducer)
		{
			return Promise.reject(
				new Error('webcam Producer already exists'));
		}

		let producer;

		return Promise.resolve()
			.then(() =>
			{
				const { device, resolution } = this._webcam;

				if (!device)
					throw new Error('no webcam devices');

				return navigator.mediaDevices.getUserMedia(
					{
						video :
						{
							deviceId : { exact: device.deviceId },
							...VIDEO_CONSTRAINS[resolution]
						}
					});
			})
			.then((stream) =>
			{
				const track = stream.getVideoTracks()[0];

				producer = this._room.createProducer(track);

				// No need to keep original track.
				track.stop();

				// Send it.
				return this._sendTransport.send(producer);
			})
			.then(() =>
			{
				this._webcamProducer = producer;

				const { device, resolution } = this._webcam;

				this._dispatch(actionCreators.newProducer(
					{
						id             : producer.id,
						source         : 'webcam',
						deviceLabel    : device.label,
						type           : this._getWebcamType(device),
						resolution     : resolution,
						locallyPaused  : producer.locallyPaused,
						remotelyPaused : producer.remotelyPaused,
						track          : producer.track
					}));

				producer.on('closed', (originator) =>
				{
					logger.debug(
						'webcam Producer "closed" event [originator:%s]', originator);

					this._webcamProducer = null;
					this._dispatch(actionCreators.producerClosed(producer.id));
				});

				producer.on('paused', (originator) =>
				{
					logger.debug(
						'webcam Producer "paused" event [originator:%s]', originator);

					this._dispatch(actionCreators.producerPaused(producer.id, originator));
				});

				producer.on('resumed', (originator) =>
				{
					logger.debug(
						'webcam Producer "resumed" event [originator:%s]', originator);

					this._dispatch(actionCreators.producerResumed(producer.id, originator));
				});
			})
			.then(() =>
			{
				logger.debug('_setWebcamProducer() succeeded');
			})
			.catch((error) =>
			{
				logger.error('_setWebcamProducer() failed:%o', error);

				if (producer)
					producer.close();

				throw error;
			});
	}

	_updateWebcams()
	{
		logger.debug('_updateWebcams()');

		// Reset the list.
		this._webcams = new Map();

		return Promise.resolve()
			.then(() =>
			{
				return navigator.mediaDevices.enumerateDevices();
			})
			.then((devices) =>
			{
				for (const device of devices)
				{
					if (device.kind !== 'videoinput')
						continue;

					this._webcams.set(device.deviceId, device);
				}
			})
			.then(() =>
			{
				const array = Array.from(this._webcams.values());
				const len = array.length;
				const currentWebcamId =
					this._webcam.device ? this._webcam.device.deviceId : undefined;

				logger.debug('_updateWebcams() [webcams:%o]', array);

				if (len === 0)
					this._webcam.device = null;
				else if (!this._webcams.has(currentWebcamId))
					this._webcam.device = array[0];

				this._dispatch(
					actionCreators.setCanChangeWebcam(this._webcams.size >= 2));
			});
	}

	_getWebcamType(device)
	{
		if (/(back|rear)/i.test(device.label))
		{
			logger.debug('_getWebcamType() | it seems to be a back camera');

			return 'back';
		}
		else
		{
			logger.debug('_getWebcamType() | it seems to be a front camera');

			return 'front';
		}
	}

	_handlePeer(peer, { notify = true } = {})
	{
		const displayName = peer.appData.displayName;

		this._dispatch(actionCreators.newPeer(
			{
				name        : peer.name,
				displayName : displayName,
				device      : peer.appData.device,
				consumers   : []
			}));

		if (notify)
		{
			this._dispatch(actionCreators.showNotification(
				{
					text : `${displayName} joined the room`
				}));
		}

		for (const consumer of peer.consumers)
		{
			this._handleConsumer(consumer);
		}

		peer.on('closed', (originator) =>
		{
			logger.debug(
				'peer "closed" event [name:"%s", originator:%s]',
				peer.name, originator);

			this._dispatch(actionCreators.peerClosed(peer.name));

			if (this._room.joined)
			{
				this._dispatch(actionCreators.showNotification(
					{
						text : `${displayName} left the room`
					}));
			}
		});

		peer.on('newconsumer', (consumer) =>
		{
			logger.debug(
				'peer "newconsumer" event [name:"%s", id:%s, consumer:%o]',
				peer.name, consumer.id, consumer);

			this._handleConsumer(consumer);
		});
	}

	_handleConsumer(consumer)
	{
		this._dispatch(actionCreators.newConsumer(
			{
				id             : consumer.id,
				peerName       : consumer.peer.name,
				source         : consumer.appData.source,
				supported      : consumer.supported,
				locallyPaused  : consumer.locallyPaused,
				remotelyPaused : consumer.remotelyPaused,
				track          : null
			}));

		consumer.on('closed', (originator) =>
		{
			logger.debug(
				'consumer "closed" event [id:%s, originator:%s, consumer:%o]',
				consumer.id, originator, consumer);

			this._dispatch(actionCreators.consumerClosed(
				consumer.id, consumer.peer.name));
		});

		consumer.on('paused', (originator) =>
		{
			logger.debug(
				'consumer "paused" event [id:%s, originator:%s, consumer:%o]',
				consumer.id, originator, consumer);

			this._dispatch(actionCreators.consumerPaused(consumer.id, originator));
		});

		consumer.on('resumed', (originator) =>
		{
			logger.debug(
				'consumer "resumed" event [id:%s, originator:%s, consumer:%o]',
				consumer.id, originator, consumer);

			this._dispatch(actionCreators.consumerResumed(consumer.id, originator));
		});

		// Receive the consumer (if we can).
		if (consumer.supported)
		{
			this._recvTransport.receive(consumer)
				.then((track) =>
				{
					this._dispatch(actionCreators.consumerGotTrack(consumer.id, track));
				})
				.catch((error) =>
				{
					logger.error(
						'unexpected error while receiving a new Consumer:%o', error);
				});
		}
	}
}