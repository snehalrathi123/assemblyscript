import Compiler from "../compiler";
import { Function } from "./function";
import { Property } from "./property";
import { Type } from "./type";
import * as typescript from "../typescript";

export abstract class ClassBase {
  name: string;
  declaration: typescript.ClassDeclaration;

  constructor(name: string, declaration: typescript.ClassDeclaration) {
    this.name = name;
    this.declaration = declaration;
  }

  toString(): string { return this.name; }
}

/** A class instance with generic parameters resolved. */
export class Class extends ClassBase {
  type: Type;
  typeParameterTypes: Type[];
  typeParametersMap: { [key: string]: Type };

  properties: { [key: string]: Property } = {};
  methods: { [key: string]: Function } = {};
  ctor?: Function;
  size: number = 0;

  constructor(name: string, declaration: typescript.ClassDeclaration, uintptrType: Type, typeParametersMap: { [key: string]: Type }) {
    super(name, declaration);
    this.type = uintptrType.withUnderlyingClass(this);
    this.typeParametersMap = typeParametersMap;
    this.typeParameterTypes = Object.keys(this.typeParametersMap).map(key => typeParametersMap[key]);
  }

  // TODO
  get isArray(): boolean { return typescript.getTextOfNode(<typescript.Identifier>this.declaration.name) === "Array"; }

  initialize(compiler: Compiler): void {
    for (let i = 0, k = this.declaration.members.length; i < k; ++i) {
      const member = this.declaration.members[i];
      switch (member.kind) {

        case typescript.SyntaxKind.PropertyDeclaration:
        {
          const propertyNode = <typescript.PropertyDeclaration>member;
          if (propertyNode.type) {
            const name = typescript.getTextOfNode(propertyNode.name);
            const type = compiler.resolveType(propertyNode.type);
            if (type) {
              this.properties[name] = new Property(name, <typescript.PropertyDeclaration>member, type, this.size);
              this.size += type.size;
            } else
              compiler.error(propertyNode.type, "Unresolvable type");
          } else
            compiler.error(propertyNode, "Type expected");
          break;
        }

        case typescript.SyntaxKind.Constructor:
        {
          const constructorNode = <typescript.ConstructorDeclaration>member;
          const localInitializers: number[] = [];
          for (let j = 0, l = constructorNode.parameters.length; j < l; ++j) {
            const parameterNode = constructorNode.parameters[j];
            if (parameterNode.modifiers && parameterNode.modifiers.length) {
              const name = typescript.getTextOfNode(parameterNode.name);
              const type = compiler.resolveType(<typescript.TypeNode>parameterNode.type);
              if (type) {
                this.properties[name] = new Property(name, /* works, somehow: */ <typescript.PropertyDeclaration>member, type, this.size);
                localInitializers.push(j);
                this.size += type.size;
              } else {
                compiler.error(parameterNode, "Unresolvable type");
              }
            }
          }
          compiler.initializeFunction(constructorNode);
          this.ctor = typescript.getReflectedFunction(constructorNode);
          for (let j = 0, l = localInitializers.length; j < l; ++j)
            this.ctor.parameters[localInitializers[j]].isAlsoProperty = true;
          break;
        }

        case typescript.SyntaxKind.MethodDeclaration:
          // initialized on demand once the class has been resolved and type information is known
          break;

        default:
          compiler.error(member, "Unsupported class member");
      }
    }
  }
}

export { Class as default };

/** A class template with possibly unresolved generic parameters. */
export class ClassTemplate extends ClassBase {
  instances: { [key: string]: Class } = {};

  constructor(name: string, declaration: typescript.ClassDeclaration) {
    super(name, declaration);
  }

  get isGeneric(): boolean { return !!(this.declaration.typeParameters && this.declaration.typeParameters.length); }

  resolve(compiler: Compiler, typeArguments: typescript.TypeNode[]): Class {
    const typeParametersCount = this.declaration.typeParameters && this.declaration.typeParameters.length || 0;
    if (typeArguments.length !== typeParametersCount)
      throw Error("type parameter count mismatch");

    const typeParametersMap: { [key: string]: Type } = {};
    let name = this.name;
    if (typeParametersCount) {
      const typeNames: string[] = new Array(typeParametersCount);
      for (let i = 0; i < typeParametersCount; ++i) {
        const parameter = (<typescript.NodeArray<typescript.TypeParameterDeclaration>>this.declaration.typeParameters)[i];
        const type = compiler.resolveType(typeArguments[i]);
        typeParametersMap[typescript.getTextOfNode(<typescript.Identifier>parameter.name)] = type;
        typeNames[i] = type.toString();
      }
      name += "<" + typeNames.join(",") + ">";
    }

    return this.instances[name] || (this.instances[name] = new Class(name, this.declaration, compiler.uintptrType, typeParametersMap));
  }
}
