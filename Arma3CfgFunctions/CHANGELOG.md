# Change Log

All notable changes to the "Arma 3 Cfg Functions" extension will be documented in this file.

## [1.1.11]
* Fixed case sensitivity of cfg properties
* Fixed wiki lookup not working in without a file existing with the `.sqf` extension
* Added an output channel for data dumping, moved two of the three info messages to output channel
* Added gateing for parse attempts to prevent doubling down on parsing at the same time
* Fixed mistake in file path inheritance

## [1.1.10]

* Updated wiki hovers
* added engine commands and BIS function auto completion
* improved performance of hovers
* fixed BIS function wiki link
* added experimental webview panel for wiki lookups

## [1.1.9]

* Fixed compiler failure with tag change in namespace layer

  ```sqf
  class myTag {
      tag = newTag;
      ...
  };
  ```
* added support for 'tagless' behaviour, making the function `myTag_fnc_someFunc` be treated as `someFunc`

## [1.1.8] *hotfix

* fixed line in wrong scope breaking bracket count

## [1.1.7]

* Fixed bug bracking description parsing when brackets where not on same indentation on line
* Fixed bug not allowing oppening/closing class attributes on same line as it was defined example:

```c++
class CfgFunctions {
...
};
```

## [1.1.6] *Hotfix

* Moved wiki lookup to a menu item 'Go to wiki entry'

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
* added setting:`Disable Auto complete` Requires restart between setting change
* added setting:`Disable Header Hover` Requires restart between setting change
* now recompiles on sqf and ext file saves (language ID), worspace folder change and config change
* updated extension display name and description to reflect new functionality

## [1.1.1]

* Improve header extraction

## [1.1.0]

* Added file peeking in the editor context menu
* added header hovers (first 12 lines, header must be in block``/*Header content*/``)

## [1.0.0]

- Initial release
