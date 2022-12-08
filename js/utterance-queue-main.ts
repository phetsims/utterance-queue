// Copyright 2019-2022, University of Colorado Boulder

import axon from '../../axon/js/main.js'; // eslint-disable-line default-import-match-filename
import phetCore from '../../phet-core/js/main.js'; // eslint-disable-line default-import-match-filename
import utteranceQueue from './main.js'; // eslint-disable-line default-import-match-filename

( function() {


  // @ts-expect-error - Assigning to window to support standalone build.
  window.axon = axon;

  // @ts-expect-error - Assigning to window to support standalone build.
  window.phetCore = phetCore;

  // @ts-expect-error - Assigning to window to support standalone build.
  window.utteranceQueue = utteranceQueue;
} );