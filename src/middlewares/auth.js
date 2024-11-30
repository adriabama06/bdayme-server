import { get_user } from "../controller/user.js";

export default async function middleware_auth(req, res, next) {
    var authorization = req.headers.authorization;

    if(!authorization) {
        return res.status(400).json({
            error: "This route requires authorization"
        });
    }

    // TODO: Use Redis to get the user id
    const id = 1; /* redis.get(authorization) */

    if(!id) {
        return res.status(400).json({
            error: "Invalid authorization"
        });
    }

    const user = await get_user(id);

    if(!user) {
        return res.status(500).json({
            error: "This user not exist in the database?"
        });
    }

    req.user = user;

    next();
}