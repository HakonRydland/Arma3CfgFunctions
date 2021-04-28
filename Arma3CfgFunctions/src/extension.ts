//basics
import * as vscode from 'vscode';
import * as fs from 'fs';

//Arma class parser
import {parse} from './class-parser';

//Engine cmd's and BIS function database
import cmdLib from "./Data/cmd.json";
import fncLib from "./Data/fnc.json";

//webview
import axios from 'axios';
const axiosInstance = axios.create();

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
}

//base defines
let functionsLib = {}
let config = vscode.workspace.getConfiguration('Arma3CfgFunctions');
let completionItems: vscode.Disposable[] = [];

//functions
function disposCompletionItems() {
    completionItems.forEach(element => {
        element.dispose();
    });
    completionItems = [];
};

let missionRoot = '';
let descriptionPath = '';
let workingFolderPath = '';
function updateFolderPaths() {
    let workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders === undefined) { return };
    missionRoot = workspaceFolders[0].uri.fsPath;
    if (config.has("MissionRoot")) {
        missionRoot = (missionRoot + "/" + config.get("MissionRoot")).split('\\').join('/');
    };
    console.debug("Mission root path: ", missionRoot);


    if (config.has('DescriptionPath')) {
        let path = <string>config.get('DescriptionPath');
        if (path != "") {
            descriptionPath = path.split('\\').join('/');
        } else {
            descriptionPath = '**/*description.ext';
        };
    };
    console.debug("Description path: ", descriptionPath);

    workingFolderPath = workspaceFolders[0].uri.fsPath.split('\\').join('/') + '/.vscode';
    if (!fs.existsSync(workingFolderPath)) {
        fs.mkdirSync(workingFolderPath);
    };
    console.debug("Working folder path: ", workingFolderPath);
};
if (vscode.workspace.workspaceFolders !== undefined) { updateFolderPaths() };


async function parseDescription(context: vscode.ExtensionContext) {

    let description = await vscode.workspace.findFiles(descriptionPath, "", 1);
    if (description.length == 0) { vscode.window.showWarningMessage("Arma3 CfgFunctions | Can't find description.ext, aborting!"); return };
    console.info(`Description.ext path: ${description[0].fsPath}`);

    vscode.workspace.openTextDocument(description[0]).then(async (document) => {
        if (document.isDirty) { vscode.window.showInformationMessage(`Arma3 CfgFunctions | File unsaved, aborting. | Path: ${descriptionPath}`);};
        //flag declaration
        let cfgFunctionsFound = false;
        let inCfgFunctions = false;
        let brackets = 0;
        console.debug("Parsing flags declaired");

        //create temp file
        fs.writeFileSync(workingFolderPath + "/cfgfunctions.txt", "");
        let fd = fs.openSync(workingFolderPath + "/cfgfunctions.txt", "a+");

        //write to temp file
        for (let index = 0; index < document.lineCount; index++) {
            const element = document.lineAt(index);
            if (inCfgFunctions && brackets == 0) { continue };
            if (!cfgFunctionsFound) {
                cfgFunctionsFound = (element.text.toLowerCase().includes("class cfgfunctions"));
                if (cfgFunctionsFound) {
                    if (element.text.includes('{')) { brackets += 1 };
                    if (element.text.includes('}')) { brackets -= 1 };
                };
            } else {
                if (element.text.includes('}')) { brackets -= 1 };
                if (cfgFunctionsFound && brackets > 0) {
                    inCfgFunctions = true;
                    if (element.text.startsWith('//')) { continue };
                    console.debug(`Line: ${element.lineNumber} | Bracket level: ${brackets} | element text: ${element.text}`);
                    if (element.text.search("#include") > -1) {
                        let path = parsePath(missionRoot, element.text);
                        await parseFile(fd, path);
                    } else {
                        fs.writeFileSync(fd, ('\n' + element.text));
                    };
                };
                if (element.text.includes('{')) { brackets += 1 };
            };
        };
        fs.closeSync(fd);

        //parse to JSON with external lib and deleteTmpFile
        let parsedjson = parse(fs.readFileSync(workingFolderPath + "/cfgfunctions.txt").toString());
        fs.unlinkSync(workingFolderPath + "/cfgfunctions.txt");

        functionsLib = await generateLibrary(parsedjson);
        console.log(functionsLib);

        //reload language additions (auto completion and header hovers)
        reloadLanguageAdditions(context);

    });
};

function parsePath(currentPath: string, include: string) {
    let path = currentPath.split('/');
    include = include.split('"')[1];
    let includePath = include.split('\\').join('/').split('/'); // windowns and linux pathing
    for (const step of includePath) {
        if (step == '..') {
            path.pop();
        } else {
            path.push(step);
        };
    };
    let ret = path.join('/');

    if (!fs.existsSync(ret)) {
        vscode.window.showErrorMessage(`Arma3 CfgFunctions | Invalid include filepath: ${include}`);
        console.error(`invalid include: ${ret}`);
    };

    return ret;
};

async function parseFile(fd:number, filePath:string) {
    let dirPathArray = filePath.split('/');
    dirPathArray.pop();
    let dirPath = dirPathArray.join('/');
    if (!fs.existsSync(filePath)) {
        return 1;
    };
    console.debug(`parsing file at --> ${filePath}`);
    await vscode.workspace.openTextDocument(filePath).then(async (document) => {
        for (let index = 0; index < document.lineCount; index++) {
            const element = document.lineAt(index);
            if (element.text.startsWith('//')) {continue};

            if (element.text.search("#include") > -1) {
                let path = parsePath(dirPath , element.text);
                await parseFile(fd, path);
            } else {
                fs.writeFileSync(fd, ('\n' + element.text));
            };
        }
    });
};

interface functionEntry {
    'Entry': {
        'Name': string
        , 'Tag': string
        , 'file': string
        , 'ext': string
        , 'Uri': vscode.Uri
        , 'Header': string
    }
};

async function generateLibrary(cfgFunctionsJSON:JSON) {

    function setPropertyIfExists (object: Object, key: string, Atributes: Object ) {
        if (Object.getOwnPropertyDescriptor(object, key)) {
            Atributes[key] = object[key];
        };
    };

    console.log("Generating function lib");
    let functionLib = {};

    //Default attributes
    let MasterAtributes = {
        'Name': ''
        , 'Tag': ''
        , 'file': 'functions'
        , 'ext': '.sqf'
        , 'Uri': vscode.Uri.prototype
        , 'Header': ''
    };

    let atributeKeys = ['tag', 'file', 'ext']
    let Tagless = config.get('Tagless')

    for (const Tag in cfgFunctionsJSON) {
        let NamespaceAtributes = Object.assign({}, MasterAtributes);
        const Namespace = cfgFunctionsJSON[Tag];

        //Namespace traits
        NamespaceAtributes.Tag = Tag;
        setPropertyIfExists(Namespace, 'file', NamespaceAtributes);

        for (const FolderName in Namespace) {
            if (atributeKeys.includes(FolderName.toLowerCase())) { continue };
            const Folder = Namespace[FolderName];
            let FolderAtributes = Object.assign({}, NamespaceAtributes);
            FolderAtributes.file = `${NamespaceAtributes.file}\\${FolderName}`;

            //Folder traits
            setPropertyIfExists(Folder,'file',FolderAtributes);
            setPropertyIfExists(Folder, 'Tag', FolderAtributes);

            //Functions
            for (const functionName in Folder) {
                if (atributeKeys.includes(functionName.toLowerCase())) { continue };
                const func = Folder[functionName];
                let functionAtributes = Object.assign( {}, FolderAtributes);

                //Function traits
                setPropertyIfExists(func, 'ext', functionAtributes);
                setPropertyIfExists(func, 'Tag', functionAtributes);
                    //Assign default call name and file path
                Object.assign(functionAtributes, { Name: functionAtributes.Tag + "_fnc_" + functionName})
                Object.assign(functionAtributes, { file: functionAtributes.file + "\\fn_" + functionName + functionAtributes.ext });
                setPropertyIfExists(func, 'file', functionAtributes);

                Object.assign(functionAtributes, { Uri: vscode.Uri.file(missionRoot + '/' + functionAtributes.file)});
                let Header = await getHeader(functionAtributes.Uri);
                Object.assign(functionAtributes, { Header: Header})

                //Registre function in library
                let name = Tagless ? functionName : functionAtributes.Name
                let entrySring = '{"' + name + '":' + JSON.stringify(functionAtributes) + '}';
                let entry: functionEntry = JSON.parse(entrySring);
                Object.assign(functionLib, entry);
            }
        }
    };
    return functionLib;
};

async function getHeader(uri: vscode.Uri) {
    //get text from file
    let text = fs.readFileSync(uri.fsPath).toString();
    if (text === undefined) { return "" };

    //find header and extract it
    if (!text.includes('/*')) { return "" };
    let header = text.split('/*')[1];
    if (header === undefined) { return "" }
    header = header.split('*/')[0];

    //trim new line
    if (header == text || header === undefined) {return ""};
    if (header.startsWith('\r\n')) {header = header.substr(2, header.length)}
    if (header.endsWith('\r\n')) { header = header.substr(0, header.length - 2) }

    //verify we actually have a header
    if (header == text || header === undefined) {return ""};
    return header
};

function reloadLanguageAdditions(context: vscode.ExtensionContext) {
    disposCompletionItems();
    if (!config.get('DisableAutoComplete')) {
        for (const key in functionsLib) {
            let disposable = vscode.languages.registerCompletionItemProvider('sqf', {
                provideCompletionItems(document: vscode.TextDocument, Position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext) {
                    return [
                        new vscode.CompletionItem(key, 2)
                    ]
                }
            })
            context.subscriptions.push(disposable);
            completionItems.push(disposable);
        };
    };

    if (!config.get('DisableHeaderHover')) {
        for (const key in functionsLib) {
            const element = functionsLib[key];
            if (!(element.Header == '')) {
                let disposable = vscode.languages.registerHoverProvider('sqf', {
                    provideHover(document, position, token) {

                        const range = document.getWordRangeAtPosition(position);
                        const word = document.getText(range);
                        if (word.toLowerCase() == key.toLowerCase()) {

                            return new vscode.Hover({
                                language: "plaintext",
                                value: element.Header
                            });
                        }
                    }
                });
                context.subscriptions.push(disposable);
                completionItems.push(disposable);
            };
        };
    }
};

function onSave(Document: vscode.TextDocument) {
    //for Arma header files recompile to catch new or removed functions
    if (Document.languageId == "ext") {
        vscode.commands.executeCommand("a3cfgfunctions.recompile");
        return
    };

    //for sqf files only update header of changed file
    if (Document.languageId == "sqf") {
        let nameArray = Document.fileName.split('\\');
        let name = nameArray[nameArray.length - 1];
        name = name.substr(3, name.length - 7); //remove fn_ prefix and .sqf file extension
        (Object.keys(functionsLib)).forEach(async Key => {
            if (Key.endsWith(name)) {
                let element = functionsLib[Key];
                let header = await getHeader(element.Uri);
                element.Header = header;
                return
            };
        });
    };
};

//works but rendering is too simple
async function openWebView(cmd: string) {
    const panel = vscode.window.createWebviewPanel(
        'browseCommandDocs', "BI Wiki: ".concat(cmd),
        vscode.ViewColumn.One, {}
    );
    const url = `https://community.bistudio.com/wiki?title=${cmd}&printable=yes"></iframe>`
    await axiosInstance.get(url).then(
        responce => {
            panel.webview.html = responce.data
        }
    )
}

function goToWiki() {
    let editor = vscode.window.activeTextEditor;
    let document = editor.document;
    let position = editor.selection.active;
    let wordCaseSensitive = document.getText(document.getWordRangeAtPosition(position));
    let word = wordCaseSensitive.toLowerCase()
    console.debug(`Attempting to go to wiki entry for ${word}`);

    //case sensetive checks (quick)
    //engine commands
    if (cmdLib[word]) {
        vscode.env.openExternal(cmdLib[word].Url)
        //openWebView(cmdLib[word].name)
        return
    };
    //BIS functions
    if (fncLib[word]) {
        vscode.env.openExternal(fncLib[word].Url)
        //openWebView(fncLib[word].name)
        return
    };

    //blind wiki search
    if (true) { //toDo make this configuration based
        const Url = `https://community.bistudio.com/wiki/${wordCaseSensitive}`
        vscode.env.openExternal(vscode.Uri.parse(Url))
        //openWebView(wordCaseSensitive)
        return
    }

    vscode.window.showInformationMessage(`Can't find wiki entry for ${wordCaseSensitive}`);
};

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.commands.registerCommand('a3cfgfunctions.recompile', () => parseDescription(context)));
    context.subscriptions.push(vscode.commands.registerTextEditorCommand('a3cfgfunctions.goToWiki', () => goToWiki()));

    //events
    context.subscriptions.push(vscode.workspace.onDidSaveTextDocument((Document) => { onSave(Document) }))

    //unlikely to catch anything...
    context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(() => {
        vscode.commands.executeCommand("a3cfgfunctions.recompile");
    }))

    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(() => {
        //update config and recompile with new settings
        config = vscode.workspace.getConfiguration('Arma3CfgFunctions');
        updateFolderPaths()
        vscode.commands.executeCommand("a3cfgfunctions.recompile");
    }))

    //custom function definitions
    context.subscriptions.push(vscode.languages.registerDefinitionProvider({ language: 'sqf' }, {
        provideDefinition(document, position) {
            let word = document.getText(document.getWordRangeAtPosition(position));

            //custom function
            let key = Object.keys(functionsLib).find((Key) => { return Key.toLowerCase() == word.toLowerCase() });
            if (functionsLib[key]) {
                return new vscode.Location(functionsLib[key].Uri, new vscode.Position(0, 0));
            };

            return undefined
        }
    }));

    context.subscriptions.push(vscode.languages.registerHoverProvider('sqf', {
        provideHover(document, position) {
            const range = document.getWordRangeAtPosition(position);
            const word = document.getText(range).toLowerCase();
            const entry: libraryEntry = cmdLib[word]
            if (entry !== undefined) {
                const firstSyntax = entry.syntaxArray[0]
                const hover = firstSyntax ? entry.description + '\n\n' + firstSyntax.Syntax + '\n\n' + firstSyntax.Params + '\n\n' + firstSyntax.Return : entry.description
                return new vscode.Hover(
                    new vscode.MarkdownString(hover)
                );
            };
        }
    }));

    context.subscriptions.push(vscode.languages.registerHoverProvider('sqf', {
        provideHover(document, position) {
            const range = document.getWordRangeAtPosition(position);
            const word = document.getText(range).toLowerCase();
            const entry: libraryEntry = fncLib[word]
            if (entry !== undefined) {
                const firstSyntax = entry.syntaxArray[0]
                const hover = firstSyntax ? entry.description + '\n\n' + firstSyntax.Syntax + '\n\n' + firstSyntax.Params + '\n\n' + firstSyntax.Return : entry.description
                return new vscode.Hover(
                    new vscode.MarkdownString(hover)
                );
            };
        }
    }));

    //finally auto compile if apropriate
    if (vscode.workspace.workspaceFolders !== undefined) { parseDescription(context) };
}

export function deactivate() {
    disposCompletionItems();
}
