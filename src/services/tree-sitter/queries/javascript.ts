/*
Enhanced JavaScript query with:
- Express.js route handlers
- Function declarations
- Variable declarations
- Module exports
Simplified for better compatibility
*/
export default `
; Express Router Setup
(variable_declaration
  (variable_declarator
    name: (identifier) @name.definition.router)) @definition.router

; Express Route Handlers
(call_expression
  function: (member_expression
    object: (identifier) @router
    property: (property_identifier) @method)
  arguments: (arguments
    (string) @path)) @definition.route

; Functions
(function_declaration
  name: (identifier) @name.definition.function) @definition.function

(variable_declaration
  (variable_declarator
    name: (identifier) @name.definition.function
    value: (arrow_function))) @definition.function

(variable_declaration
  (variable_declarator
    name: (identifier) @name.definition.function
    value: (function_expression))) @definition.function

; Variables
(variable_declaration
  (variable_declarator
    name: (identifier) @name.definition.variable)) @definition.variable

; Module Exports
(expression_statement
  (assignment_expression
    left: (member_expression
      object: (identifier) @module
      property: (property_identifier) @name.definition.export))) @definition.module_exports

; Express Route Methods
(member_expression
  object: (identifier) @router
  property: (property_identifier) @method) @definition.route_method

; Express Route Paths
(call_expression
  function: (member_expression
    object: (identifier) @router
    property: (property_identifier) @method)
  arguments: (arguments
    (string) @path)) @definition.route_path
`;
