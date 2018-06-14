### GraphQLGenie API
___
**constructor**
```ts
constructor(options: GraphQLGenieOptions)
```
Create a new GraphQLGenie. GraphQLGenieOptions look like:

```ts
// Most likely pass in typeDefs, schemaBuilder is for advanced use cases 
interface GraphQLGenieOptions {
	schemaBuilder?: GraphQLSchemaBuilder;
	typeDefs?: string;
	generatorOptions?: GenerateConfig;
	fortuneOptions: FortuneOptions;
}
// All default to true
interface GenerateConfig {
	generateGetAll?: boolean; // GraphQL API will have a Query to get all of a type, with filters
	generateCreate?: boolean; // GraphQL API will have a Mutation to create new data of each type
	generateUpdate?: boolean; // GraphQL API will have a Mutation to update data of each type
	generateDelete?: boolean; // GraphQL API will have a Mutation to delete data of each type
	generateUpsert?: boolean; // GraphQL API will have a Mutation to upsert data of each type
	generateConnections?: boolean; // GraphQL API will have a Query to get all of a type, with filters, that returns a Connection rather than simple array
}
```
___ 
**use**
```ts 
use(plugin: GeniePlugin): Promise<Void> 
```

Pass in a plugin that alters the schema, see the [subscriptions plugin](https://github.com/genie-team/graphql-genie/tree/master/plugins/subscriptions) for an example

> See info about the GeniePlugin interface in [GraphQLGenieInterfaces.ts](https://github.com/genie-team/graphql-genie/blob/master/src/GraphQLGenieInterfaces.ts)
___
**getSchema**
```ts 
getSchema(): GraphQLSchema
```

Get the schema
___
**printSchema**
```ts 
printSchema(): string
```

Return a string of the full schema with directives
___
**getFragmentTypes**
```ts 
getFragmentTypes(): Promise<Void>
```
When using Apollo or another tool you may need to get information on the fragment types, genie provides a helper for this
```ts
import { IntrospectionFragmentMatcher, IntrospectionResultData } from 'apollo-cache-inmemory';
const introspectionQueryResultData = <IntrospectionResultData>await genie.getFragmentTypes();
const fragmentMatcher = new IntrospectionFragmentMatcher({
	introspectionQueryResultData
});
```
___
**getDataResolver**
```ts 
getDataResolver(): DataResolver
```
DataResolver handles all the operations with your actual data. Such as CRUD and hooks. 

Most likely use of this is to add hooks into the CRUD operations against your database. The DataResolver has 2 functions to add hooks. For more info on the context, record and update objects see the [fortune documentation](http://fortune.js.org/#input-and-output-hooks).

```ts
 interface DataResolverInputHook {
	(context?, record?, update?): any;
}
 interface DataResolverOutputHook {
	(context?, record?): any;
}
	addOutputHook(graphQLTypeName: string, hook: DataResolverOutputHook);
	addInputHook(graphQLTypeName: string, hook: DataResolverInputHook);
```

> See info about the DataResolver interface in [GraphQLGenieInterfaces.ts](https://github.com/genie-team/graphql-genie/blob/master/src/GraphQLGenieInterfaces.ts)
___
**getSchemaBuilder**
```ts 
getSchemaBuilder(): GraphQLSchemaBuilder 
```
GraphQLSchemaBuilder has some additional helpers to add types and resolvers to a graphql schema

See the [GraphQLSchemaBuilder API documentation](#graphqlschemabuilder-api)

___

### GraphQLSchemaBuilder API
___
**printSchemaWithDirectives**
```ts 
printSchemaWithDirectives()
```
Returns a string of the full schema with directives
___
**addTypeDefsToSchema**
```ts 
addTypeDefsToSchema($typeDefs = ''): GraphQLSchema
```
Completely rebuilds the schema with the new typeDefs. You need to use this if we want any of the custom directives to work on your new typeDefs. Other wise you can use the schema stitching tools from 
___
**setResolvers**
```ts 
setResolvers(typeName: string, fieldResolvers: Map<string, GraphQLFieldResolver<any, any>>)
```
Set resolvers on the schema for the given typename and a map of the fild name to the resolver
___
**setIResolvers**
```ts 
setIResolvers(iResolvers: IResolvers): GraphQLSchema
```
Set resolvers of type [IResolvers from graphql-tools](https://www.apollographql.com/docs/graphql-tools/resolvers.html#Resolver-map)
___
**isUserType**
```ts 
isUserType(type: GraphQLType): boolean
```
returns true if the type isn't generated by GraphQLGenie
___