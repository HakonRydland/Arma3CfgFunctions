# Arma 3 CfgFunctions

## Features

Allows for the generation of auto completion intelisens for you Arma 3 mission functions, function peeking, and function header preview trough hovers.

Note for consistent results it is recommended to seth both paths in the settings.

## How to use

1. Set relative paths to both `mission root` and `description.ext`
2. open Command Palette and run `Arma 3: Recompile CfgFunctions`
3. Recompile when ever you add a function to CfgFunctions


* Auto completion is done on typing with language `sqf`
* Function peeking is done trough editor context menu

* Hovers are shown on function hover

## Extension Settings

This extension contributes the following settings:

* `Arma3CfgFunctions.DescriptionPath`: Set the description.ext path used
* `Arma3CfgFunctions.MissionRoot`: set the path to the mission root

Both paths are workspace relative

## Release Notes

### [1.1.0]

* Added file peeking in the editor context menu
* added header hovers (first 12 lines, header must be in block ```/*Header content*/```)

### 1.0.0

Initial release of Arma 3 CfgFunctions


## Known issues

This extension only works with the first of your workspace folders

**Enjoy!**
