<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware) {
        //
    })
    ->withExceptions(function (Exceptions $exceptions) {
        $exceptions->render(function (\Illuminate\Database\QueryException $e, \Illuminate\Http\Request $request) {
            if ($request->is('api/*') || $request->expectsJson()) {
                if ($e->getCode() === '23000' || str_contains($e->getMessage(), 'a foreign key constraint fails')) {
                    if (str_contains($e->getMessage(), 'Cannot delete or update a parent row') || str_contains($e->getMessage(), '1451')) {
                        return response()->json([
                            'message' => 'Cannot delete this record because it is referenced by other items in the system.'
                        ], 409);
                    }
                    if (str_contains($e->getMessage(), 'Cannot add or update a child row') || str_contains($e->getMessage(), '1452')) {
                        return response()->json([
                            'message' => 'One or more referenced records do not exist.'
                        ], 422);
                    }
                }
            }
        });
    })->create();
