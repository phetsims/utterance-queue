// Copyright 2019-2020, University of Colorado Boulder

/**
 * IO type for UtteranceQueue
 *
 * @author Michael Kauzmann (PhET Interactive Simulations)
 */

import BooleanIO from '../../tandem/js/types/BooleanIO.js';
import ObjectIO from '../../tandem/js/types/ObjectIO.js';
import StringIO from '../../tandem/js/types/StringIO.js';
import VoidIO from '../../tandem/js/types/VoidIO.js';
import utteranceQueueNamespace from './utteranceQueueNamespace.js';

class UtteranceQueueIO extends ObjectIO {}

UtteranceQueueIO.methods = {
  addToBack: {
    returnType: VoidIO,
    parameterTypes: [ StringIO ],
    implementation: function( textContent ) {
      return this.phetioObject.addToBack( textContent );
    },
    documentation: 'Add the utterance (string) to the end of the queue.',
    invocableForReadOnlyElements: false
  },

  addToFront: {
    returnType: VoidIO,
    parameterTypes: [ StringIO ],
    implementation: function( textContent ) {
      return this.phetioObject.addToFront( textContent );
    },
    documentation: 'Add the utterance (string) to the beginning of the queue.',
    invocableForReadOnlyElements: false
  },

  setMuted: {
    returnType: VoidIO,
    parameterTypes: [ BooleanIO ],
    implementation: function( muted ) {
      this.phetioObject.muted( muted );
    },
    documentation: 'Set whether the utteranceQueue will be muted or not. If muted, utterances still move through the ' +
                   'queue but will not be read by screen readers.',
    invocableForReadOnlyElements: false
  },
  getMuted: {
    returnType: BooleanIO,
    parameterTypes: [ VoidIO ],
    implementation: function() {
      return this.phetioObject.muted();
    },
    documentation: 'Get whether the utteranceQueue is muted. If muted, utterances still move through the ' +
                   'queue but will not be read by screen readers.'
  },
  setEnabled: {
    returnType: VoidIO,
    parameterTypes: [ BooleanIO ],
    implementation: function( enabled ) {
      this.phetioObject.enabled( enabled );
    },
    documentation: 'Set whether the utteranceQueue will be enabled or not. When enabled, Utterances cannot be added to ' +
                   'the queue, and the Queue cannot be cleared. Also nothing will be sent to assistive technology.',
    invocableForReadOnlyElements: false
  },
  getEnabled: {
    returnType: BooleanIO,
    parameterTypes: [ VoidIO ],
    implementation: function() {
      return this.phetioObject.enabled();
    },
    documentation: 'Get whether the utteranceQueue is enabled. When enabled, Utterances cannot be added to ' +
                   'the queue, and the Queue cannot be cleared. Also nothing will be sent to assistive technology.'
  }
};

UtteranceQueueIO.documentation = 'Manages a queue of Utterances that are read in order by a screen reader.';
UtteranceQueueIO.events = [ 'announced' ];
UtteranceQueueIO.validator = { valueType: Object };
UtteranceQueueIO.typeName = 'UtteranceQueueIO';
ObjectIO.validateSubtype( UtteranceQueueIO );

utteranceQueueNamespace.register( 'UtteranceQueueIO', UtteranceQueueIO );
export default UtteranceQueueIO;