utterance-queue
=======================================================

Alerting queue and library powered by aria-live

By PhET Interactive Simulations
http://phet.colorado.edu/

### Documentation

This is under active prototyping, so please expect any sort of API to change. Comments at this stage are very welcome.

[Grunt](http://gruntjs.com/) is used to build the source ("npm update -g grunt-cli", "npm update" and "grunt" at the top level
should build into build/). [Node.js](http://nodejs.org/) is required for this process.

Currently, you can find the compiled library at [utterance-queue.min.js](http://phetsims.github.io/utterance-queue/build/utterance-queue.min.js) 
This is currently not versioned due to the accelerated development speed.

Building source code requires the phetsims compiling repository: [chipper](http://phetsims.github.io/chipper/). Once 
dependencies are downloaded, source is compiled by running `grunt`.

The [PhET Development Overview](https://github.com/phetsims/phet-info/blob/master/doc/phet-development-overview.md) is the most complete guide to PhET Simulation Development. This guide includes how
to obtain simulation code and its dependencies, notes about architecture & design, how to test and build the sims, as well as other important information.

### License
See the [license](LICENSE)