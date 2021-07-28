//basics
import * as vscode from 'vscode'
import * as fs from 'fs'

//Arma class parser
import { parse } from './class-parser'
import { generate as generateLib, functionEntry } from './FunctionLibrary'

//Engine cmd's and BIS function database
import cmdLib from "./Data/cmd.json"
import fncLib from "./Data/fnc.json"
import axios from 'axios'

let outputChannel = vscode.window.createOutputChannel('A3 CfgFunctions')

//axios instance
const axiosInstance = axios.create()

//database entries interface
interface libraryEntry {
    name: string
    description: string
    syntaxArray: Array<{
        Syntax: string
        Params: string
        Return: string
    }>
    examples: Array<string>
    Url: string
    modifiers: Array<string>
}

//base defines
let functionsLib = {}
let config = vscode.workspace.getConfiguration('Arma3CfgFunctions')
let completionItems = []

//functions
function disposCompletionItems() {
    completionItems.forEach(element => {
        element.dispose()
    })
    completionItems = []
}

let missionRoot = ''
let descriptionPath = ''
let workingFolderPath = ''
function updateFolderPaths() {
    let workspaceFolders = vscode.workspace.workspaceFolders
    if (workspaceFolders === undefined) return
    missionRoot = workspaceFolders[0].uri.fsPath
    if (config.has("Path.MissionRoot")) {
        missionRoot = (missionRoot + "/" + config.get("Path.MissionRoot")).split('\\').join('/')
    }
    console.debug("Mission root path: ", missionRoot)


    if (config.has('Path.DescriptionPath')) {
        let path = <string>config.get('Path.DescriptionPath')
        if (path != "") {
            descriptionPath = path.split('\\').join('/')
        } else {
            descriptionPath = '**/*description.ext'
        }
    }
    console.debug("Description path: ", descriptionPath)

    workingFolderPath = workspaceFolders[0].uri.fsPath.split('\\').join('/') + '/.vscode'
    if (!fs.existsSync(workingFolderPath)) fs.mkdirSync(workingFolderPath)
    console.debug("Working folder path: ", workingFolderPath)
}
if (vscode.workspace.workspaceFolders !== undefined) updateFolderPaths()

let parsingDescription = false
async function parseDescription(context: vscode.ExtensionContext) {
    //block parsing being run parallel with itself
    if (parsingDescription) return
    parsingDescription = true

    let description = await vscode.workspace.findFiles(descriptionPath, "", 1)
    if (description.length == 0) {
        outputChannel.appendLine('Can`t find the description.ext, aborting.')
        parsingDescription = false
        return
    }
    console.info(`Description.ext path: ${description[0].fsPath}`)

    let document = await vscode.workspace.openTextDocument(description[0])
    if (document.isDirty) {
        outputChannel.appendLine(`File unsaved, aborting. | Path: ${descriptionPath}`)
        parsingDescription = false
        return
    }
    //flag declaration
    let cfgFunctionsFound = false
    let inCfgFunctions = false
    let brackets = 0
    console.debug("Parsing flags declaired")

    //create temp file
    fs.writeFileSync(workingFolderPath + "/cfgfunctions.txt", "")
    let fd = fs.openSync(workingFolderPath + "/cfgfunctions.txt", "a+")

    //write to temp file
    for (let index = 0; index < document.lineCount; index++) {
        const element = document.lineAt(index)
        if (inCfgFunctions && brackets == 0) { continue }
        if (!cfgFunctionsFound) {
            cfgFunctionsFound = (element.text.toLowerCase().includes("class cfgfunctions"));
            if (cfgFunctionsFound) {
                if (element.text.includes('{')) { brackets += 1 }
                if (element.text.includes('}')) { brackets -= 1 }
            }
        } else {
            if (element.text.includes('}')) { brackets -= 1 }
            if (cfgFunctionsFound && brackets > 0) {
                inCfgFunctions = true;
                if (element.text.startsWith('//')) continue
                console.debug(`Line: ${element.lineNumber} | Bracket level: ${brackets} | element text: ${element.text}`)
                if (element.text.search("#include") > -1) {
                    let path = parsePath(missionRoot, element.text)
                    await parseFile(fd, path)
                } else {
                    fs.writeFileSync(fd, ('\n' + element.text))
                }
            }
            if (element.text.includes('{')) { brackets += 1 }
        };
    };
    fs.closeSync(fd)

    //parse to JSON with external lib and deleteTmpFile
    let parsedjson = parse(fs.readFileSync(workingFolderPath + "/cfgfunctions.txt").toString())
    fs.unlinkSync(workingFolderPath + "/cfgfunctions.txt")

    functionsLib = await generateLibrary(parsedjson)
    console.log(functionsLib)

    //reload language additions (auto completion and header hovers)
    reloadLanguageAdditions(context)
    parsingDescription = false
};

function parsePath(currentPath: string, include: string) {
    let path = currentPath.split('/')
    include = include.split('"')[1]
    let includePath = include.split('\\').join('/').split('/'); // windows and linux pathing
    for (const step of includePath) {
        if (step == '..') {
            path.pop()
        } else {
            path.push(step)
        }
    }
    let ret = path.join('/')

    if (!fs.existsSync(ret)) {
        outputChannel.appendLine(`Invalid include, relative filepath: ${include} | absolute filepath: ${ret}`)
        console.error(`invalid include: ${ret}`)
        ret = '';
    };

    return ret;
};

//recursive to handle sub-includes
async function parseFile(fd:number, filePath:string) {
    let dirPathArray = filePath.split('/')
    dirPathArray.pop()
    let dirPath = dirPathArray.join('/')
    if (!fs.existsSync(filePath)) return 1

    console.debug(`parsing file at --> ${filePath}`);
    let document = await vscode.workspace.openTextDocument(filePath)
    for (let index = 0; index < document.lineCount; index++) {
        const element = document.lineAt(index);
        if (element.text.startsWith('//')) { continue }

        if (element.text.search("#include") > -1) {
            let path = parsePath(dirPath, element.text)
            if (fs.existsSync(path)) await parseFile(fd, path);
        } else {
            fs.writeFileSync(fd, ('\n' + element.text))
        }
    }
};

async function generateLibrary(cfgFunctionsJSON: JSON) {
    console.log("Generating function lib");
    let functionsRegistry = generateLib(cfgFunctionsJSON)
    let functionLib = {};
    let Tagless = config.get('Cfg.Tagless')

    //format the lib data based on settings
    for (const funcKey in functionsRegistry) {
        let func = functionsRegistry[funcKey]

        func.nameShort = funcKey
        func.name = `${func.tag}_fnc_${funcKey}`

        let filePath = (func.file === '') ? func.folderPath : func.file
        console.debug(func.folderPath)
        func.Uri = vscode.Uri.file(`${missionRoot}\\${filePath}\\fn_${func.nameShort}${func.ext}`)

        let Header = await getHeader(func.Uri)
        func.header = Header

        let name = Tagless ? func.nameShort : func.name
        let entrySring = '{"' + name.toLowerCase() + '":' + JSON.stringify(func) + '}'
        let entry: functionEntry = JSON.parse(entrySring)
        Object.assign(functionLib, entry)
    }

    return functionLib
};

async function getHeader(uri: vscode.Uri) {
    //get text from file
    let text = fs.readFileSync(uri.fsPath).toString()
    if (text === undefined) { return "" }

    //find header and extract it
    if (!text.includes('/*')) { return "" }
    let header = text.split('/*')[1]
    if (header === undefined) { return "" }
    header = header.split('*/')[0]

    //trim new line
    if (header == text || header === undefined) { return "" }
    if (header.startsWith('\r\n')) {header = header.substr(2, header.length)}
    if (header.endsWith('\r\n')) { header = header.substr(0, header.length - 2) }

    //verify we actually have a header
    if (header == text || header === undefined) { return "" }
    return header
};

function reloadLanguageAdditions(context: vscode.ExtensionContext) {
    disposCompletionItems()
    if (!config.get('Cfg.DisableAutoComplete')) {
        for (const key in functionsLib) {
            const entry: functionEntry = functionsLib[key]
            let completionText = config.get('Cfg.Tagless') ? entry.nameShort : entry.name
            let disposable = vscode.languages.registerCompletionItemProvider('sqf', {
                provideCompletionItems(document: vscode.TextDocument, Position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext) {
                    return [
                        new vscode.CompletionItem(completionText, 2)
                    ]
                }
            })
            context.subscriptions.push(disposable);
            completionItems.push(disposable);
        }
    }

    if (!config.get('Cfg.DisableHeaderHover')) {
        let disposable = vscode.languages.registerHoverProvider('sqf', {
            provideHover(document, position) {
                const range = document.getWordRangeAtPosition(position)
                const word = document.getText(range).toLowerCase()
                const entry: functionEntry = functionsLib[word]
                if (entry.header === '') return undefined
                if (entry !== undefined) {
                    return new vscode.Hover({
                        language: "plaintext",
                        value: entry.header
                    })
                }
            }
        })
        context.subscriptions.push(disposable)
        completionItems.push(disposable)
    }

}

function onSave(Document: vscode.TextDocument) {
    //for Arma header files recompile to catch new or removed functions
    if (Document.languageId == "ext") {
        vscode.commands.executeCommand("a3cfgfunctions.recompile")
        return
    };

    //for sqf files only update header of changed file
    if (Document.languageId == "sqf") {
        let nameArray = Document.fileName.split('\\')
        let name = nameArray[nameArray.length - 1]
        name = name.substr(3, name.length - 7); //remove fn_ prefix and .sqf file extension
        (Object.keys(functionsLib)).forEach(async Key => {
            if (Key.endsWith(name.toLowerCase())) {
                let element = functionsLib[Key]
                let header = await getHeader(element.Uri)
                element.Header = header
                return
            };
        });
    };
};

//works but rendering is too simple
async function openWebView(cmd: string) {

    const panel = vscode.window.createWebviewPanel(
        'html', "BI Wiki: ".concat(cmd),
        vscode.ViewColumn.One, {
        enableScripts: true,
        enableFindWidget: true,
        enableCommandUris: true
    });
    const url = `https://community.bistudio.com/wiki?title=${cmd}`
    axiosInstance.get(url).then(r => { panel.webview.html = r.data })
}

function openExternalLink(cmd: string, Url: vscode.Uri) {
    if (config.get('wiki.useWebview')) {
        openWebView(cmd)
        return
    }

    vscode.env.openExternal(Url)
}

function goToWiki() {
    let editor = vscode.window.activeTextEditor
    let document = editor.document
    let position = editor.selection.active
    let wordCaseSensitive = document.getText(document.getWordRangeAtPosition(position))
    let word = wordCaseSensitive.toLowerCase()
    console.debug(`Attempting to go to wiki entry for ${word}`)

    //engine commands
    if (cmdLib[word]) {
        const entry = cmdLib[word]
        openExternalLink(entry.name, entry.Url)
        return
    };
    //BIS functions
    if (fncLib[word]) {
        const entry = fncLib[word]
        openExternalLink(entry.name, entry.Url)
        return
    };

    //blind wiki search
    if (config.get('wiki.allowBlindSearch')) { //toDo make this configuration based
        const Url = `https://community.bistudio.com/wiki/${wordCaseSensitive}`
        openExternalLink(wordCaseSensitive, vscode.Uri.parse(Url))
        return
    }

    vscode.window.showInformationMessage(`Can't find wiki entry for ${wordCaseSensitive}`);
};

let engineAndBISHovers: vscode.Disposable[] = []
function loadEngineAndBISHovers(context: vscode.ExtensionContext) {
    engineAndBISHovers.forEach(element => { element.dispose() })
    engineAndBISHovers = []

    if (config.get('Engine.EnableCommandsHover')) {
        const disposable = vscode.languages.registerHoverProvider('sqf', {
            provideHover(document, position) {
                const range = document.getWordRangeAtPosition(position)
                const word = document.getText(range).toLowerCase()
                const entry: libraryEntry = cmdLib[word]
                if (entry !== undefined) {
                    const modifiers = entry.modifiers
                    const modifierText = modifiers.length > 0 ? modifiers.reduce((prev, cur) => { return `${prev} **${cur}** |` }, '|') + '\n\n' : ''
                    const firstSyntax = entry.syntaxArray[0]
                    const hover = firstSyntax ? entry.description + '\n\n#### Syntax:\n' + firstSyntax.Syntax + '\n\n' + firstSyntax.Params + '\n\n#### Return:\n' + firstSyntax.Return : entry.description
                    return new vscode.Hover(
                        new vscode.MarkdownString(modifierText + hover)
                    )
                }
            }
        })
        context.subscriptions.push(disposable)
        engineAndBISHovers.push(disposable)
    }

    if (config.get('Engine.EnableFunctionHover')) {
        const disposable = vscode.languages.registerHoverProvider('sqf', {
            provideHover(document, position) {
                const range = document.getWordRangeAtPosition(position);
                const word = document.getText(range).toLowerCase();
                const entry: libraryEntry = fncLib[word]
                if (entry !== undefined) {
                    const modifiers = entry.modifiers
                    const modifierText = modifiers.length > 0 ? modifiers.reduce((prev, cur) => { return `${prev} **${cur}** |` }, '|') + '\n\n' : ''
                    const firstSyntax = entry.syntaxArray[0]
                    const hover = firstSyntax ? entry.description + '\n\n#### Syntax:\n' + firstSyntax.Syntax + '\n\n' + firstSyntax.Params + '\n\n#### Return:\n' + firstSyntax.Return : entry.description
                    return new vscode.Hover(
                        new vscode.MarkdownString(modifierText + hover)
                    )
                }
            }
        })
        context.subscriptions.push(disposable)
        engineAndBISHovers.push(disposable)
    }
}

let engineAndBIScompletions: vscode.Disposable[] = []
function loadEngineAndBISCompletion(context: vscode.ExtensionContext) {
    engineAndBIScompletions.forEach(element => { element.dispose() })
    engineAndBIScompletions = []

    if (config.get('Engine.enableCommandsAutoComplete')) {
        for (const key in cmdLib) {
            const entry: libraryEntry = cmdLib[key]
            const disposable = vscode.languages.registerCompletionItemProvider('sqf', {
                provideCompletionItems(document: vscode.TextDocument, Position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext) {
                    let cmpItems = []
                    for (const syntaxElement of entry.syntaxArray) {
                        let cmpItem = new vscode.CompletionItem(entry.name, 13)
                        let docu = syntaxElement.Syntax + ' --> ' + syntaxElement.Return
                        cmpItem.documentation = new vscode.MarkdownString(docu)
                        cmpItems.push(cmpItem)
                    }
                    return cmpItems
                }
            })
            context.subscriptions.push(disposable)
            engineAndBIScompletions.push(disposable)
        }
    }
    if (config.get('Engine.enableFunctionAutoComplete')) {
        for (const key in fncLib) {
            const entry: libraryEntry = fncLib[key]
            const disposable = vscode.languages.registerCompletionItemProvider('sqf', {
                provideCompletionItems(document: vscode.TextDocument, Position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext) {
                    let cmpItems = []
                    for (const syntaxElement of entry.syntaxArray) {
                        let cmpItem = new vscode.CompletionItem(entry.name, 13)
                        let docu = syntaxElement.Syntax + ' --> ' + syntaxElement.Return
                        cmpItem.documentation = new vscode.MarkdownString(docu)
                        cmpItems.push(cmpItem)
                    }
                    return cmpItems
                }
            })
            context.subscriptions.push(disposable)
            engineAndBIScompletions.push(disposable)
        }
    }
}


export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.commands.registerCommand('a3cfgfunctions.recompile', () => parseDescription(context)))
    context.subscriptions.push(vscode.commands.registerTextEditorCommand('a3cfgfunctions.goToWiki', () => goToWiki()))

    //events
    context.subscriptions.push(vscode.workspace.onDidSaveTextDocument((Document) => { onSave(Document) }))

    //unlikely to catch anything...
    context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(() => {
        vscode.commands.executeCommand("a3cfgfunctions.recompile")
    }))

    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(() => {
        //update config and recompile with new settings
        config = vscode.workspace.getConfiguration('Arma3CfgFunctions')
        updateFolderPaths()
        vscode.commands.executeCommand("a3cfgfunctions.recompile")
        loadEngineAndBISHovers(context)
        loadEngineAndBISCompletion(context)
    }))

    //custom function definitions
    context.subscriptions.push(vscode.languages.registerDefinitionProvider({ language: 'sqf' }, {
        provideDefinition(document, position) {
            let word = document.getText(document.getWordRangeAtPosition(position)).toLowerCase()

            //custom function
            if (functionsLib[word]) {
                return new vscode.Location(functionsLib[word].Uri, new vscode.Position(0, 0))
            };

            return undefined
        }
    }));

    //extra hovers and auto completion
    loadEngineAndBISHovers(context)
    loadEngineAndBISCompletion(context)

    //finally auto compile if apropriate
    if (vscode.workspace.workspaceFolders !== undefined) { parseDescription(context) }
}

export function deactivate() {
    disposCompletionItems()
}
