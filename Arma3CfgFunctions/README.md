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
* Function peeking is done trough editor context menu*Go to Definition/Peek Definition* , this includes engine commands and BIS function lookups
* Hovers are shown on function hover
* engine commands and BIS function hovers are disabled in settings by default, to use you need to enable them.

## Extension Settings

This extension contributes the following settings:

| Config entry | Description |
| - | - |
| Arma3CfgFunctions.Path.DescriptionPath | set the description.ext path used |
| Arma3CfgFunctions.Path.MissionRoot | set the path to the mission root |
| Arma3CfgFunctions.Cfg.DisableAutoComplete | disable auto completing functions |
| Arma3CfgFunctions.Cfg.DisableHeaderHover | disable header preview on function hover |
| Arma3CfgFunctions.Cfg.Tagless | enables tagless behavior, warning may cause issues with functions with same name but different tags |
| Arma3CfgFunctions.Engine.EnableCommandsAutoComplete | Enables auto completion for engine commands |
| Arma3CfgFunctions.Engine.EnableCommandsHover | enables engine command wiki hover  |
| Arma3CfgFunctions.Engine.EnableFunctionAutoComplete | enables BIS functions auto completion |
| Arma3CfgFunctions.Engine.EnableFunctionHover | enables BIS functions wiki hover |
| Arma3CfgFunctions.wiki.useWebview | Use experimental webview panel for wiki lookups |
| Arma3CfgFunctions.wiki.allowBlindSearch | allows wiki search for non database  words |

Both `Description Path` and `Mission Root` paths are workspace relative

## Release Notes

* Updated wiki hovers
* added engine commands and BIS function auto completion
* improved performance of hovers
* fixed BIS function wiki link
* added experimental webview panel for wiki lookups

## Known issues

This extension only works with the first of your workspace folders.
Tagless can lead to issues with functions with same name but different tags.

---

###### Found something wrong? Report it [here](https://github.com/HakonRydland/Arma3CfgFunctions/issues)

###### Want to donate? I appreciate it! Right trough [here](https://ko-fi.com/hakonrydland)

**Enjoy!**
