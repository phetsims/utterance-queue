// Copyright 2019-2022, University of Colorado Boulder

/**
 * Creates the namespace for this repository.  By convention, this should have been declared in a file "utteranceQueue.js"
 * But that filename was already used for the main library singleton, so we use the alternate convention discussed in:
 * https://github.com/phetsims/tandem/issues/5#issuecomment-162597651 for phetsims/Tandem
 *
 * @author Michael Kauzmann (PhET Interactive Simulations)
 */

import Namespace from '../../phet-core/js/Namespace.js';

export default new Namespace( 'utteranceQueue' );