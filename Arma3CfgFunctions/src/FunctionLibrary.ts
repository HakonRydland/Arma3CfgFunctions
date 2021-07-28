import { debug } from 'node:console'
import { type } from 'node:os'
import * as vscode from 'vscode'

//eternal use
export interface functionEntry {
    name: string
    , nameShort: string
    , tag: string
    , file: string
    , ext: string
    , uri: vscode.Uri
    , header: string
};

export class functionEntry {
    name = ''
    nameShort = ''
    tag = ''
    file = ''
    ext = '.sqf'
    uri = vscode.Uri.prototype
    header = ''
}

export function generate(CfgFunctions: Object) {
    //parse the config and build function data
    for (const Tag in CfgFunctions) {
        let namespace = new MasterAtributes
        namespace.tag = Tag
        namespace.folderPath = 'functions'
        let TagObject = CfgFunctions[Tag]

        for (const key in TagObject) {
            let value = TagObject[key]
            if (typeof value !== 'object') namespace[key] = value
        }

        for (const key in TagObject) {
            let value = TagObject[key]
            if (typeof value === 'object') {
                parseChildObject(namespace, TagObject, key)
            }
        }
    }

    console.debug(functionsRegistry)
    return functionsRegistry
};

//internal use
let functionsRegistry = {}

class MasterAtributes {
    name = ''
    nameShort = ''
    tag = ''
    file = ''
    ext = '.sqf'
    Uri = vscode.Uri.prototype
    header = ''
    folderPath = 'functions'
}

function parseChildObject(parentNamespace: MasterAtributes, parent: MasterAtributes, key: string) {
    let namespace = Object.assign({}, parentNamespace)
    namespace.folderPath = parentNamespace.folderPath + `\\${key}`
    let currentClass = parent[key]
    let isContainer = false

    for (let childKey in currentClass) {
        let child = currentClass[childKey]
        if (typeof child !== 'object') namespace[childKey.toLowerCase()] = child
    }

    for (let childKey in currentClass) {
        let child = currentClass[childKey]
        if (typeof child === 'object') {
            isContainer = true
            parseChildObject(namespace, currentClass, childKey)
        }
    }

    if (!isContainer) {
        //if not is container fix folderPath by removing the function name form the end, then registre the function
        let path = namespace.folderPath.split('\\')
        path.pop()
        namespace.folderPath = path.join('\\')
        functionsRegistry[key] = namespace
    }
}
