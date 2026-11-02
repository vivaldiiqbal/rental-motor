const userRepo = require('./userRepo');
const documentRepo = require('./documentRepo');
const motorRepo = require('./motorRepo');
const bookingRepo = require('./bookingRepo');
const paymentRepo = require('./paymentRepo');
const reviewRepo = require('./reviewRepo');
const favoriteRepo = require('./favoriteRepo');
const promoRepo = require('./promoRepo');
const contactRepo = require('./contactRepo');
const idempotencyRepo = require('./idempotencyRepo');
const metaRepo = require('./metaRepo');
const handoverRepo = require('./handoverRepo');
const returnRepo = require('./returnRepo');
const bookingNoteRepo = require('./bookingNoteRepo');
const auditRepo = require('./auditRepo');
const settingsRepo = require('./settingsRepo');
const maintenanceRepo = require('./maintenanceRepo');
const addonRepo = require('./addonRepo');
const locationRepo = require('./locationRepo');
const reportRepo = require('./reportRepo');
const mappers = require('./mappers');
const errors = require('./errors');

module.exports = {
  userRepo,
  documentRepo,
  motorRepo,
  bookingRepo,
  paymentRepo,
  reviewRepo,
  favoriteRepo,
  promoRepo,
  contactRepo,
  idempotencyRepo,
  metaRepo,
  handoverRepo,
  returnRepo,
  bookingNoteRepo,
  auditRepo,
  settingsRepo,
  maintenanceRepo,
  addonRepo,
  locationRepo,
  reportRepo,
  mappers,
  errors,
};
