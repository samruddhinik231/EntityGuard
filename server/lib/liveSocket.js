let ioInstance = null;

const setIo = (io) => {
  ioInstance = io;
};

const emitLiveState = (users, globalScore) => {
  if (!ioInstance) {
    return;
  }
  ioInstance.emit('users_updated', users);
  if (globalScore !== undefined) {
    ioInstance.emit('global_score_updated', globalScore);
  }
};

const emitNewAlert = (alert) => {
  if (!ioInstance) {
    return;
  }
  ioInstance.emit('alert', alert);
};

module.exports = {
  setIo,
  emitLiveState,
  emitNewAlert
};