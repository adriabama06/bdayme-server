/**
 * Strict validation of the :id route param.
 * Only accepts positive safe integers (rejects -1, 0, floats, "12abc", huge numbers).
 * The parsed id is stored in req.validated_id.
 */
export default function middleware_valid_id(req, res, next) {
    const raw = req.params.id;

    const id = typeof raw == "string" && /^\d+$/.test(raw) ? Number(raw) : NaN;

    if(!Number.isSafeInteger(id) || id <= 0) {
        return res.status(400).json({
            error: "Id must be a int"
        });
    }

    req.validated_id = id;

    next();
}
