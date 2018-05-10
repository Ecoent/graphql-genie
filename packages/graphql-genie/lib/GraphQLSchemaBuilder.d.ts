import { GraphQLFieldResolver, GraphQLSchema } from 'graphql';
import { GenerateConfig } from './GraphQLGenieInterfaces';
export default class GraphQLSchemaBuilder {
    private schema;
    private typeDefs;
    private config;
    private resolveFunctions;
    constructor(typeDefs: string, $config: GenerateConfig);
    addTypeDefsToSchema: ($typeDefs?: string) => GraphQLSchema;
    getSchema: () => GraphQLSchema;
    addResolvers: (typeName: string, fieldResolvers: Map<string, GraphQLFieldResolver<any, any, {
        [argName: string]: any;
    }>>) => GraphQLSchema;
}