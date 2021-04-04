# Arma 3 CfgFunctions

## Features

Allows for the generation of auto completion intelisens for you Arma 3 mission functions, function peeking, and function header preview trough hovers.

Note for consistent results it is recommended to set both paths in the settings.

## How to use

1. Set relative paths to both `mission root` and `description.ext` in the extension settings.
2. open Command Palette and run `Arma 3: Recompile CfgFunctions`
3. Recompile when ever you add a function to CfgFunctions

* Auto completion is done on typing with language `sqf`
* Function peeking is done trough editor context menu
* Hovers are shown on function hover

## Extension Settings

This extension contributes the following settings:

* `Arma3CfgFunctions.DescriptionPath`: set the description.ext path used
* `Arma3CfgFunctions.MissionRoot`: set the path to the mission root
* `Arma3CfgFunctions.DisableAutoComplete`: disable auto completing functions
* `Arma3CfgFunctions.DisableHeaderHover`: disable header preview on function hover

Both paths are workspace relative

## Release Notes

*

## Known issues

This extension only works with the first of your workspace folders

**Enjoy!**
