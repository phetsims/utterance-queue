// Copyright 2020, University of Colorado Boulder

/**
 * An Utterance that supports a few Properties for extra control with Web Speech synthesis.
 *
 * @author Jesse Greenberg
 */
import utteranceQueueNamespace from './utteranceQueueNamespace.js';
import Utterance from './Utterance.js';
import merge from '../../phet-core/js/merge.js';

class SelfVoicingUtterance extends Utterance {

  /**
   * @param {Object} [options]
   */
  constructor( options ) {

    options = merge( {

      // {boolean} - If true and this Utterance is currently being spoken by the speech synth, announcing it
      // to the queue again will immediately cancel the synth and new content will be
      // spoken. Otherwise, new content for this utterance will be spoken whenever the old
      // content has finished speaking
      cancelSelf: true,

      // {boolean} - If true and another Utterance is currently being spoken by the speech synth,
      // announcing this Utterance will immediately cancel the other content being spoken by the synth.
      // Otherwise, content for the new utterance will be spoken as soon as the browser finishes speaking
      // the old content
      cancelOther: true
    }, options );

    super( options );

    // @public (read-only) - used by webSpeaker.announce implementation for utteranceQueue
    this.cancelSelf = options.cancelSelf;
    this.cancelOther = options.cancelOther;
  }
}

utteranceQueueNamespace.register( 'SelfVoicingUtterance', SelfVoicingUtterance );
export default SelfVoicingUtterance;