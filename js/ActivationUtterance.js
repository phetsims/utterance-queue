// Copyright 2019, University of Colorado Boulder

/**
 * An utterance that should generally be used for announcing a change after an "activation" interaction such
 * as clicking a button or a checkbox. The delay for waiting for utterance stability is chosen such that the alert won't
 * become stable and be spoken faster than the press and hold delay for continuous clicking with the "enter" key. See
 * Utterance.js for a description of utterance "stability". The result is that pressing and holding "enter" on a
 * button will result in only a single utterance.
 *
 * @author Jesse Greenberg
 */
define( require => {
  'use strict';

  // modules
  const merge = require( 'PHET_CORE/merge' );
  const utteranceQueueNamespace = require( 'UTTERANCE_QUEUE/utteranceQueueNamespace' );
  const Utterance = require( 'UTTERANCE_QUEUE/Utterance' );

  class ActivationUtterance extends Utterance {

    /**
     * @param {Object} [options]
     */
    constructor( options ) {

      options = merge( {

        // {number} - in ms, should be larger than 500, prevents the utterance from being duplicated within the delay
        // of press and hold for most typical user settings
        alertStableDelay: 500
      }, options );

      assert && assert( options.alertStableDelay >= 500, 'Utterance will likely be duplicated if activated with key press and hold' );

      super( options );
    }
  }

  return utteranceQueueNamespace.register( 'ActivationUtterance', ActivationUtterance );
} );
