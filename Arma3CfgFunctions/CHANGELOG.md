# Change Log

All notable changes to the "Arma 3 Cfg Functions" extension will be documented in this file.

## [1.1.5]

* moved function peeking to built in 'go to definition' and it's subfunction 'Peek definition'
* Added wiki definition peeking for arma engine commands (opens browser)
* added wiki hovers for engine commands (disabled by default, performance heavy)

## [1.1.4]

* Fixed typo in tags
* Fixed bug blocking compilation on extension activation
* Reduced saving performance impact by only updating header of changed sqf files

## [1.1.3]

* Removed hover and peek case sensitivity
* fixed setting change requiring reload

## [1.1.2]

* Added auto compile on startup
* added setting: `Disable Auto complete` Requires restart between setting change
* added setting: `Disable Header Hover` Requires restart between setting change
* now recompiles on sqf and ext file saves (language ID), worspace folder change and config change
* updated extension display name and description to reflect new functionality

## [1.1.1]

* Improve header extraction

## [1.1.0]

* Added file peeking in the editor context menu
* added header hovers (first 12 lines, header must be in block ```/*Header content*/```)

## [1.0.0]

- Initial release
