// Copyright 2019-2020, University of Colorado Boulder

/**
 * IO Type for UtteranceQueue
 *
 * @author Michael Kauzmann (PhET Interactive Simulations)
 */

import BooleanIO from '../../tandem/js/types/BooleanIO.js';
import IOType from '../../tandem/js/types/IOType.js';
import StringIO from '../../tandem/js/types/StringIO.js';
import VoidIO from '../../tandem/js/types/VoidIO.js';
import utteranceQueueNamespace from './utteranceQueueNamespace.js';

const UtteranceQueueIO = new IOType( 'UtteranceQueueIO', {
  valueType: Object,
  documentation: 'Manages a queue of Utterances that are read in order by a screen reader.',
  events: [ 'announced' ],
  methods: {
    addToBack: {
      returnType: VoidIO,
      parameterTypes: [ StringIO ],
      implementation: function( textContent ) {
        return this.addToBack( textContent );
      },
      documentation: 'Add the utterance (string) to the end of the queue.',
      invocableForReadOnlyElements: false
    },

    addToFront: {
      returnType: VoidIO,
      parameterTypes: [ StringIO ],
      implementation: function( textContent ) {
        return this.addToFront( textContent );
      },
      documentation: 'Add the utterance (string) to the beginning of the queue.',
      invocableForReadOnlyElements: false
    },

    setMuted: {
      returnType: VoidIO,
      parameterTypes: [ BooleanIO ],
      implementation: function( muted ) {
        this.muted( muted );
      },
      documentation: 'Set whether the utteranceQueue will be muted or not. If muted, utterances still move through the ' +
                     'queue but will not be read by screen readers.',
      invocableForReadOnlyElements: false
    },
    getMuted: {
      returnType: BooleanIO,
      parameterTypes: [ VoidIO ],
      implementation: function() {
        return this.muted();
      },
      documentation: 'Get whether the utteranceQueue is muted. If muted, utterances still move through the ' +
                     'queue but will not be read by screen readers.'
    },
    setEnabled: {
      returnType: VoidIO,
      parameterTypes: [ BooleanIO ],
      implementation: function( enabled ) {
        this.enabled( enabled );
      },
      documentation: 'Set whether the utteranceQueue will be enabled or not. When enabled, Utterances cannot be added to ' +
                     'the queue, and the Queue cannot be cleared. Also nothing will be sent to assistive technology.',
      invocableForReadOnlyElements: false
    },
    getEnabled: {
      returnType: BooleanIO,
      parameterTypes: [ VoidIO ],
      implementation: function() {
        return this.enabled();
      },
      documentation: 'Get whether the utteranceQueue is enabled. When enabled, Utterances cannot be added to ' +
                     'the queue, and the Queue cannot be cleared. Also nothing will be sent to assistive technology.'
    }
  }
} );

utteranceQueueNamespace.register( 'UtteranceQueueIO', UtteranceQueueIO );
export default UtteranceQueueIO;