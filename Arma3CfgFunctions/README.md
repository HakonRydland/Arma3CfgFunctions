# Arma 3 CfgFunctions

## Features

Allows for the generation of auto completion intelisens for you Arma 3 mission functions, function peeking, and function header preview trough hovers.

Note for consistent results it is recommended to set both paths in the settings.

Allows BIS wiki search trough definitions for engine commands and BIS functions, and wiki info preview trough hovers. info shown includes: locality, description, syntax, and examples.

## How to use

1. Set relative paths to both `mission root` and `description.ext` in the extension settings.
2. open Command Palette and run `Arma 3: Recompile CfgFunctions`
3. Recompile when ever you add a function to CfgFunctions

* Auto completion is done on typing with language `sqf`
* Function peeking is done trough editor context menu *Go to Definition/Peek Definition* , this includes engine commands and BIS function lookups
* Hovers are shown on function hover
* engine commands and BIS function hovers are disabled in settings by default, to use you need to enable them.

## Extension Settings

This extension contributes the following settings:

* `Arma3CfgFunctions.DescriptionPath`: set the description.ext path used
* `Arma3CfgFunctions.MissionRoot`: set the path to the mission root
* `Arma3CfgFunctions.DisableAutoComplete`: disable auto completing functions
* `Arma3CfgFunctions.DisableHeaderHover`: disable header preview on function hover
* `Arma3CfgFunctions.EnableCommandHover` : enables engine command wiki hover (performance heavy, disabled by default)
* `Arma3CfgFunctions.EnableFunctionsHover` : enables BIS functions wiki hover (performance heavy, disabled by default)
* `Arma3CfgFunctions.caseInsensetive` : enables case insensetiv wiki lookups for engine commands and BIS functions

Both paths are workspace relative

## Release Notes

* moved and improved mission function definition peeking, now usable by the 'Go to Definition/Peek Definition' buttons in the context menu.
* added wiki lookups trough same button, can search case insensetiv if enabled in settings.
* added wiki hovers, disabled by default as they will increase hover load time significantly.

## Known issues

This extension only works with the first of your workspace folders

**Enjoy!**
