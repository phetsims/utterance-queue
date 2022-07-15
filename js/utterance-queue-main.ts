// Copyright 2019-2022, University of Colorado Boulder

import axon from '../../axon/js/main.js'; // eslint-disable-line default-import-match-filename
import phetCore from '../../phet-core/js/main.js'; // eslint-disable-line default-import-match-filename
import utteranceQueue from './main.js'; // eslint-disable-line default-import-match-filename

( function() {


  // @ts-ignore
  window.axon = axon;

  // @ts-ignore
  window.phetCore = phetCore;

  // @ts-ignore
  window.utteranceQueue = utteranceQueue;
} );