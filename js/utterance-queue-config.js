// Copyright 2019, University of Colorado Boulder

/**
 * Configuration file for development and production deployments.
 *
 * @author Michael Kauzmann (PhET Interactive Simulations)
 * @author Taylor Want (PhET Interactive Simulations)
 */

require.config( {
  // depends on all of scenery, kite, dot, axon, phet-core and utterance-queue
  deps: [ 'utterance-queue-main' ],

  paths: {

    // plugins
    image: '../../chipper/js/requirejs-plugins/image',
    ifphetio: '../../chipper/js/requirejs-plugins/ifphetio',

    // third-party libs
    text: '../../sherpa/lib/text-2.0.12',

    UTTERANCE_QUEUE: '.',
    KITE: '../../kite/js',
    DOT: '../../dot/js',
    PHET_CORE: '../../phet-core/js',
    AXON: '../../axon/js',
    SCENERY: '../../scenery/js',

    TANDEM: '../../tandem/js',
    REPOSITORY: '..'
  },

  // optional cache bust to make browser refresh load all included scripts, can be disabled with ?cacheBust=false
  urlArgs: Date.now()
} );
