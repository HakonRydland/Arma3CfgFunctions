import * as vscode from 'vscode';
import * as fs from 'fs';
import {parse} from './class-parser';

//base defines

let functionsLib = {}
let config = vscode.workspace.getConfiguration('Arma3CfgFunctions');
let completionItems = [vscode.Disposable.prototype];
completionItems.pop();

//functions
function disposCompletionItems() {
    completionItems.forEach(element => {
        element.dispose();
    });
    completionItems = [];
};

function updateMissionRoot() {
    let workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders === undefined) { return "" };
    let missionRoot = workspaceFolders[0].uri.fsPath;
    if (config.has("MissionRoot")) {
        missionRoot = (missionRoot + "/" + config.get("MissionRoot")).split('\\').join('/');
    };
    console.debug("Mission root path: ", missionRoot);
    return missionRoot;
};
if (vscode.workspace.workspaceFolders !== undefined) { updateMissionRoot() };


async function parseDescription(context: vscode.ExtensionContext) {

    //root description.ext path
    let descriptionPath = '**/*description.ext';
    if (config.has('DescriptionPath')) {
        let path = <string> config.get('DescriptionPath');
        if (path != "") {
            descriptionPath = path.split('\\').join('/');
        };
    };
    let description = await vscode.workspace.findFiles(descriptionPath, "", 1);
    if (description.length == 0) { vscode.window.showWarningMessage("Arma3 CfgFunctions | Can't find description.ext, aborting!"); return };
    console.info(`Description.ext path: ${description[0].fsPath}`);

    //mission root
    let missionRoot = updateMissionRoot();

    //working folder
    let workingFolderPath = missionRoot + '/.vscode';
    if (!fs.existsSync(workingFolderPath)) {
        fs.mkdirSync(workingFolderPath);
    };

    vscode.workspace.openTextDocument(description[0]).then(async (document) => {
        if (document.isDirty) { vscode.window.showInformationMessage(`Arma3 CfgFunctions | File unsaved, aborting. | Path: ${descriptionPath}`);};
        //flag declaration
        let cfgFunctionsFound = false;
        let inCfgFunctions = false;
        let brackets = 0;
        console.debug("Parsing flags declaired");

        //create temp file
        fs.writeFileSync(workingFolderPath+"/cfgfunctions", "");
        let fd = fs.openSync(workingFolderPath+"/cfgfunctions", "a+");

        //write to temp file
        for (let index = 0; index < document.lineCount; index++) {
            const element = document.lineAt(index);
            if (inCfgFunctions && brackets == 0) {continue};
            if (!cfgFunctionsFound) { cfgFunctionsFound = (element.text.toLowerCase().search("class cfgfunctions") > -1)} else {

                brackets -= element.text.search('}') + 1;
                if (cfgFunctionsFound && brackets > 0) {
                    inCfgFunctions = true;
                    if (element.text.startsWith('//')) {continue};
                    console.debug(`Line: ${element.lineNumber} | Bracket level: ${brackets} | element text: ${element.text}`);
                    if (element.text.search("#include") > -1) {
                        let path = parsePath(missionRoot, element.text);
                        await parseFile(fd, path);
                    } else {
                        fs.writeFileSync(fd, ('\n' + element.text));
                    };
                };
                brackets += element.text.search('{') + 1;
            };
        };
        fs.closeSync(fd);

        //parse to JSON with external lib and deleteTmpFile
        let parsedjson = parse(fs.readFileSync(workingFolderPath+"/cfgfunctions").toString());
        fs.unlinkSync(workingFolderPath+"/cfgfunctions");

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

async function generateLibrary(cfgFunctionsJSON:JSON) {

    function setPropertyIfExists (object: Object, key: string, Atributes: Object ) {
        if (Object.getOwnPropertyDescriptor(object, key)) {
            Atributes[key] = object[key];
        };
    };

    let missionRoot = updateMissionRoot();

    console.log("Generating function lib");
    let functionLib = {};

    //Default attributes
    let MasterAtributes = {
        'Name': ""
        , 'Tag': ""
        , 'file': "functions"
        , 'ext': ".sqf"
        , 'Uri': vscode.Uri.prototype
        , 'Header': ""
    };

    let atributeKeys = ['Tag','file','ext']

    for (const Tag in cfgFunctionsJSON) {
        let NamespaceAtributes = Object.assign({}, MasterAtributes);
        const Namespace = cfgFunctionsJSON[Tag];

        //Namespace traits
        NamespaceAtributes.Tag = Tag;
        setPropertyIfExists(Namespace, 'file', NamespaceAtributes);

        for (const FolderName in Namespace) {
            const Folder = Namespace[FolderName];
            let FolderAtributes = Object.assign({}, NamespaceAtributes);
            FolderAtributes.file = `${NamespaceAtributes.file}\\${FolderName}`;

            //Folder traits
            setPropertyIfExists(Folder,'file',FolderAtributes);
            setPropertyIfExists(Folder, 'Tag', FolderAtributes);

            //Functions
            for (const functionName in Folder) {
                if (atributeKeys.includes(functionName)) {continue};
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
                let entrySring = '{"'+functionAtributes.Name+'":'+JSON.stringify(functionAtributes)+'}';
                let entry = JSON.parse(entrySring);
                Object.assign(functionLib, entry);
            }
        }
    };
    return functionLib;
};

function PeekFile() {
    //find what is selected
    const editor = vscode.window.activeTextEditor;
    let selectionStart = editor.selection.start;
    if (!selectionStart) {
        selectionStart = editor.selection.active;
    };
    let wordRange = editor.document.getWordRangeAtPosition(selectionStart);
    let selectedText = editor.document.getText(wordRange).toLowerCase();

    //find function in library
    let index = Object.getOwnPropertyNames(functionsLib).find((value: string) => value.toLowerCase() == selectedText);
    if (index === undefined) { vscode.window.showInformationMessage(`Arma3 CfgFunctions | Could not find function definition: ${selectedText}`); return };

    //open file
    let missionRoot = updateMissionRoot();
    let functionPath = (missionRoot + '/' + functionsLib[index]['file']).split('/').join('\\');
    let fncUri = vscode.Uri.file(functionPath);
    vscode.window.showTextDocument(fncUri);
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
            const element = functionsLib[key];
            let disposable = vscode.languages.registerCompletionItemProvider('sqf', {
                provideCompletionItems(document: vscode.TextDocument, Position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext) {
                    return [
                        new vscode.CompletionItem(element.Name)
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
                        if (word.toLowerCase() == element.Name.toLowerCase()) {

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

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.commands.registerCommand('a3cfgfunctions.recompile', () => parseDescription(context)) );
    context.subscriptions.push(vscode.commands.registerTextEditorCommand('a3cfgfunctions.peek', () => PeekFile()) );
    if (vscode.workspace.workspaceFolders !== undefined) { parseDescription(context) };

    //events
    context.subscriptions.push(vscode.workspace.onDidSaveTextDocument((Document: vscode.TextDocument) => {

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

    }))

    //unlikely to catch anything...
    context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(() => {
        vscode.commands.executeCommand("a3cfgfunctions.recompile");
    }))

    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(() => {
        //update config and recompile with new settings
        config = vscode.workspace.getConfiguration('Arma3CfgFunctions');
        vscode.commands.executeCommand("a3cfgfunctions.recompile");
    }))
}

export function deactivate() {
    disposCompletionItems();
}
