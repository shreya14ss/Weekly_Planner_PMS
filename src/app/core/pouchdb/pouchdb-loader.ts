/**
 * Centralised PouchDB loader.
 *
 * PouchDB is CommonJS-ish and its plugins mutate the default export. We
 * register everything once here and re-export the configured class so the
 * rest of the app never has to think about plugin order or bundler quirks.
 */
import PouchDB from 'pouchdb';
import PouchFind from 'pouchdb-find';

PouchDB.plugin(PouchFind);

export { PouchDB };
