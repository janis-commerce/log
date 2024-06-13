'use strict';

let listeningEndedEvent = false;

module.exports.shouldAddEndedListener = () => {
	return !listeningEndedEvent;
};

module.exports.endedListenerWasAdded = () => {
	listeningEndedEvent = true;
};

module.exports.cleanListeningEndedEvent = () => {
	listeningEndedEvent = false;
};
